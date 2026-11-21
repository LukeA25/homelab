"""Exercise the real ASGI routes without a listening port or HTTP client dependency."""
import json
import tempfile
import unittest
from pathlib import Path
from app import main

class LearningAPI(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.old_db=main.DB
        main.DB=str(Path(self.tmp.name)/'learning.db')

    def tearDown(self):
        main.DB=self.old_db
        self.tmp.cleanup()

    async def request(self,method,path,body=None,query=''):
        payload=json.dumps(body).encode() if body is not None else b''
        output=[]
        async def receive(): return {'type':'http.request','body':payload,'more_body':False}
        async def send(message): output.append(message)
        await main.app({'type':'http','asgi':{'version':'3.0'},'http_version':'1.1','method':method,'scheme':'http','path':path,'raw_path':path.encode(),'query_string':query.encode(),'headers':[(b'content-type',b'application/json')],'server':('test',80),'client':('test',1),'root_path':''},receive,send)
        status=next(m['status'] for m in output if m['type']=='http.response.start')
        raw=b''.join(m.get('body',b'') for m in output if m['type']=='http.response.body')
        return status,json.loads(raw) if raw else None

    async def recap(self):
        code,s=await self.request('POST','/api/trees/ml/sessions',{'concept_id':'models'})
        self.assertEqual(code,200)
        self.assertIn(s['id'],s['prompt'])
        self.assertIn('Do not suggest stopping', s['prompt'])
        return {'schema_version':'0.1','session_id':s['id'],'tree_id':'ml','topics':[{'concept_id':'models','summary':'Models use patterns from training examples.','evidence':'Explained how held-out examples differ from training data.','confidence':'Comfortable','state':'developing'}],'questions':[]}

    async def test_preview_does_not_mutate_then_accept_persists_and_deduplicates(self):
        body=await self.recap()
        self.assertEqual((await self.request('POST','/api/import/preview',body))[0],200)
        before=(await self.request('GET','/api/workspace'))[1]
        self.assertEqual(before['trees'][0]['concepts'][0]['notes'],'')
        self.assertEqual((await self.request('POST','/api/import/accept',body))[0],200)
        after=(await self.request('GET','/api/workspace'))[1]
        self.assertEqual(after['trees'][0]['concepts'][0]['notes'],body['topics'][0]['summary'])
        self.assertEqual(after['sessions'][0]['recap'],body)
        self.assertEqual((await self.request('POST','/api/import/accept',body))[0],409)

    async def test_unknown_concept_rejects_whole_import(self):
        body=await self.recap()
        body['topics'].append({**body['topics'][0],'concept_id':'invented'})
        self.assertEqual((await self.request('POST','/api/import/accept',body))[0],422)
        data=(await self.request('GET','/api/workspace'))[1]
        self.assertEqual(data['trees'][0]['concepts'][0]['notes'],'')

    async def test_session_path_mismatch(self):
        body=await self.recap();body['tree_id']='graphs'
        self.assertEqual((await self.request('POST','/api/import/preview',body))[0],422)

    async def test_schema_state_and_evidence_validation(self):
        body=await self.recap();body['schema_version']='2.0'
        self.assertEqual((await self.request('POST','/api/import/preview',body))[0],422)
        body['schema_version']='0.1';body['topics'][0]['state']='mastered'
        self.assertEqual((await self.request('POST','/api/import/preview',body))[0],422)
        body['topics'][0].update(state='understood',evidence=' ')
        self.assertEqual((await self.request('POST','/api/import/preview',body))[0],422)

    async def test_duplicate_concepts(self):
        body=await self.recap();body['topics']*=2
        self.assertEqual((await self.request('POST','/api/import/preview',body))[0],422)

    async def test_structured_ideas_preview_then_save_and_plan(self):
        draft={'title':'DNS','idea':'How names become addresses','why':'The homelab','direction':'Explain a lookup','starting_point':'I use it daily','source':'How names become addresses','suggestion':''}
        self.assertEqual((await self.request('POST','/api/ideas/preview',{'ideas':[draft, {**draft,'title':'Proxies','idea':'What a reverse proxy does'}]}))[0],200)
        self.assertEqual((await self.request('GET','/api/workspace'))[1]['ideas'],[])
        code,saved=await self.request('POST','/api/ideas/batch',{'ideas':[draft]})
        self.assertEqual(code,200)
        self.assertEqual(saved['ideas'][0]['suggestion'],'')
        self.assertEqual((await self.request('POST','/api/ideas',{'text':'   '}))[0],422)
        self.assertTrue(saved['ideas'][0]['id'])

    async def test_previous_notes_and_preferences_reach_the_next_lesson(self):
        body=await self.recap()
        self.assertEqual((await self.request('POST','/api/import/accept',body))[0],200)
        self.assertEqual((await self.request('POST','/api/preferences',{'text':'Use homelab examples'}))[0],200)
        code,session=await self.request('POST','/api/trees/ml/sessions',{'concept_id':'models'})
        self.assertEqual(code,200)
        self.assertIn('held-out examples', session['prompt'])
        context=main.pending_session(session['id'])
        self.assertIn('Use homelab examples', context['prompt'])
        self.assertEqual((await self.request('POST','/api/preferences',{'text':'   '}))[0],422)
        pref=(await self.request('GET','/api/workspace'))[1]['preferences'][0]
        self.assertEqual((await self.request('DELETE','/api/preferences/'+pref['id']))[0],200)
        self.assertEqual(main.pending_session(session['id'])['prompt'].count('Use homelab examples'),0)

    async def test_ideas_persist_and_delete(self):
        self.assertEqual((await self.request('POST','/api/ideas',{'text':'   '}))[0],422)
        self.assertEqual((await self.request('POST','/api/ideas',{'text':'How does DNS work?'}))[0],200)
        data=(await self.request('GET','/api/workspace'))[1]
        self.assertEqual(data['ideas'][0]['text'],'How does DNS work?')
        await self.request('DELETE','/api/ideas/'+data['ideas'][0]['id'])
        self.assertEqual((await self.request('GET','/api/workspace'))[1]['ideas'],[])

    async def test_create_scoped_path_and_activate(self):
        code,t=await self.request('POST','/api/trees',dict(title='DNS',category='Networking',goal='Explain name resolution',depth='Conversational',excludes='DNSSEC',outcomes=['Explain recursion'],concepts=['Names','Resolvers']))
        self.assertEqual(code,200);self.assertEqual(t['status'],'planned')
        self.assertEqual(t['concepts'][1]['requires'],[t['concepts'][0]['id']])
        self.assertEqual((await self.request('PATCH','/api/trees/'+t['id'],{'status':'active'}))[0],200)
        self.assertEqual((await self.request('PATCH','/api/trees/'+t['id'],{'status':'nonsense'}))[0],422)

    async def test_knowledge_is_reused_across_trees_and_close_saves_it(self):
        concept={'title':'Act & potency','objectives':['Distinguish act from potency'],'teaching_notes':'Start from change the learner can point to.','requires':[]}
        code,first=await self.request('POST','/api/trees',{'title':'Thomism','category':'Theology / Thomism','goal':'Discuss act and potency','depth':'Conversational fluency','excludes':'','outcomes':['Distinguish act from potency'],'concepts':[concept]})
        self.assertEqual(code,200)
        knowledge_id=first['concepts'][0]['knowledge_id']
        code,second=await self.request('POST','/api/trees',{'title':'Grace','category':'Theology','goal':'Discuss grace','depth':'Conversational fluency','excludes':'','outcomes':['Explain grace'],'concepts':[{**concept,'title':'Act & potency'}]})
        self.assertEqual(code,200)
        self.assertEqual(second['concepts'][0]['knowledge_id'],knowledge_id)
        code,session=await self.request('POST',f"/api/trees/{second['id']}/sessions",{'concept_id':second['concepts'][0]['id']})
        self.assertEqual(code,200)
        close={'topics':[{'concept_id':second['concepts'][0]['id'],'summary':'Act is what a thing is doing.','evidence':'Explained the distinction with an example.','confidence':'Comfortable','state':'understood'}],'questions':[]}
        self.assertEqual((await self.request('POST',f"/api/sessions/{session['id']}/close",close))[0],200)
        data=(await self.request('GET','/api/workspace'))[1]
        shared=[node for tree in data['trees'] if tree['id'] in (first['id'],second['id']) for node in tree['concepts'] if node['title']=='Act & potency']
        self.assertTrue(all(node['state']=='understood' and node['knowledge_id']==knowledge_id for node in shared))
        record=next(item for item in data['knowledge'] if item['id']==knowledge_id)
        self.assertEqual(record['state'],'understood')
        self.assertIn('Act is what a thing is doing.', record['notes'])
        self.assertEqual((await self.request('POST',f"/api/sessions/{session['id']}/close",close))[0],409)

    async def test_path_edits_change_objectives_and_reject_foreign_nodes(self):
        concept={'title':'Names','objectives':['Define a name'],'teaching_notes':'Use the homelab.','requires':[]}
        code,path=await self.request('POST','/api/trees',{'title':'DNS','category':'Networking','goal':'Explain resolution','depth':'Conversational','excludes':'DNSSEC','outcomes':['Explain recursion'],'concepts':[concept]})
        self.assertEqual(code,200)
        code,other=await self.request('POST','/api/trees',{'title':'Other','category':'Networking','goal':'Something else','depth':'Conversational','excludes':'','outcomes':['Name it'],'concepts':[{**concept,'title':'Other'}]})
        self.assertEqual(code,200)
        updated=(await self.request('PATCH','/api/trees/'+path['id'],{'concepts':[{'id':path['concepts'][0]['id'],'objectives':['Explain how a lookup starts']}]}))[1]
        self.assertEqual(updated['concepts'][0]['objectives'],['Explain how a lookup starts'])
        self.assertEqual((await self.request('PATCH','/api/trees/'+path['id'],{'concepts':[{'id':other['concepts'][0]['id'],'title':'Stolen'}]}))[0],422)
        self.assertEqual((await self.request('POST','/api/trees',{'title':'Broken','category':'Theology','goal':'Reuse a missing record','depth':'Conversational fluency','excludes':'','outcomes':['Explain it'],'concepts':[{**concept,'knowledge_id':'missing'}]}))[0],422)
        found=(await self.request('GET','/api/knowledge',query='q=Names'))[1]['knowledge']
        self.assertTrue(any(item['title']=='Names' for item in found))

    async def test_missing_path_and_concept(self):
        self.assertEqual((await self.request('POST','/api/trees/missing/sessions',{'concept_id':'models'}))[0],404)
        self.assertEqual((await self.request('POST','/api/trees/ml/sessions',{'concept_id':'invented'}))[0],422)

if __name__=='__main__': unittest.main()
