"""Exercise the real ASGI routes without a listening port or HTTP client dependency."""
import json
import tempfile
import unittest
from pathlib import Path
from urllib.parse import urlsplit
from app import main

class LearningAPI(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.old_db=main.DB
        main.DB=str(Path(self.tmp.name)/'learning.db')

    def tearDown(self):
        main.DB=self.old_db
        self.tmp.cleanup()

    async def request(self,method,path,body=None):
        payload=json.dumps(body).encode() if body is not None else b''
        parsed=urlsplit(path)
        output=[]
        async def receive(): return {'type':'http.request','body':payload,'more_body':False}
        async def send(message): output.append(message)
        await main.app({'type':'http','asgi':{'version':'3.0'},'http_version':'1.1','method':method,'scheme':'http','path':parsed.path,'raw_path':parsed.path.encode(),'query_string':parsed.query.encode(),'headers':[(b'content-type',b'application/json')],'server':('test',80),'client':('test',1),'root_path':''},receive,send)
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
        idea_id=saved['ideas'][0]['id']
        code,stored=await self.request('POST','/api/drafts',{'title':'Names','category':'Networking','goal':'Explain resolution','depth':'Conversational fluency','outcomes':['Explain a lookup'],'concepts':['Names'],'idea_id':idea_id})
        self.assertEqual(code,200)
        self.assertEqual((await self.request('GET','/api/workspace'))[1]['drafts'][0]['id'],stored['id'])
        code,tree=await self.request('POST','/api/trees',{'title':'Names','category':'Networking','goal':'Explain resolution','depth':'Conversational fluency','excludes':'','outcomes':['Explain a lookup'],'concepts':['Names'],'idea_id':idea_id})
        self.assertEqual(code,200)
        self.assertEqual(tree['idea_id'],idea_id)
        self.assertEqual((await self.request('GET','/api/workspace'))[1]['drafts'],[])
        self.assertEqual((await self.request('POST','/api/trees',{'title':'Names','category':'Networking','goal':'Explain resolution','depth':'Conversational fluency','excludes':'','outcomes':['Explain a lookup'],'concepts':['Names'],'idea_id':'missing'}))[0],422)

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

    async def test_missing_path_and_concept(self):
        self.assertEqual((await self.request('POST','/api/trees/missing/sessions',{'concept_id':'models'}))[0],404)
        self.assertEqual((await self.request('POST','/api/trees/ml/sessions',{'concept_id':'invented'}))[0],422)

    def rich(self, title, objectives, requires=None, knowledge_id=None):
        item={'title':title,'objectives':objectives,'teaching_notes':f'Teach {title} from what the learner can already say.','requires':requires or []}
        if knowledge_id: item['knowledge_id']=knowledge_id
        return item

    async def test_close_session_reuses_knowledge_across_trees(self):
        concept=self.rich('Act & potency', ['Distinguish act from potency'])
        code, first=await self.request('POST','/api/trees', dict(title='Thomism', category='Theology / Thomism', goal='Discuss act and potency', depth='Conversational fluency', excludes='', outcomes=['Explain act and potency'], concepts=[concept]))
        self.assertEqual(code, 200)
        knowledge_id=first['concepts'][0]['knowledge_id']
        self.assertTrue(knowledge_id)
        code, second=await self.request('POST','/api/trees', dict(title='Grace', category='Theology / Thomism', goal='Discuss grace', depth='Conversational fluency', excludes='', outcomes=['Explain grace'], concepts=[self.rich('Potency again', ['Use potency in a new setting'], knowledge_id=knowledge_id)]))
        self.assertEqual(second['concepts'][0]['knowledge_id'], knowledge_id)
        code, session=await self.request('POST', f"/api/trees/{second['id']}/sessions", {'concept_id': second['concepts'][0]['id']})
        self.assertIn('Act & potency', session['prompt'])
        saved={'topics':[{'concept_id':second['concepts'][0]['id'],'summary':'Potency is the capacity to become.','evidence':'Explained potency with an example.','confidence':'Comfortable','state':'understood'}]}
        self.assertEqual((await self.request('POST', f"/api/sessions/{session['id']}/close", saved))[0], 200)
        data=(await self.request('GET','/api/workspace'))[1]
        shared=next(item for item in data['knowledge'] if item['id']==knowledge_id)
        self.assertEqual(shared['state'], 'understood')
        self.assertEqual(shared['notes'], saved['topics'][0]['summary'])
        for tree in data['trees']:
            if tree['id'] in (first['id'], second['id']):
                self.assertEqual(tree['concepts'][0]['notes'], saved['topics'][0]['summary'])
        self.assertEqual((await self.request('POST', f"/api/sessions/{session['id']}/close", saved))[0], 409)
        code, found=await self.request('GET','/api/knowledge?q=potency&subject=thomism')
        self.assertEqual(code, 200)
        self.assertEqual(found['matches'][0]['id'], knowledge_id)

    async def test_update_path_changes_objectives_and_rejects_other_trees(self):
        code, session=await self.request('POST','/api/trees/ml/sessions',{'concept_id':'models'})
        self.assertEqual(code, 200)
        code, updated=await self.request('POST', f"/api/sessions/{session['id']}/path", {'concepts':[{'id':'models','objectives':['Explain what a model learns','Separate training from prediction']}]})
        self.assertEqual(code, 200)
        self.assertEqual(updated['concepts'][0]['objectives'], ['Explain what a model learns','Separate training from prediction'])
        graphs=(await self.request('GET','/api/workspace'))[1]['trees'][1]
        self.assertEqual((await self.request('POST', f"/api/sessions/{session['id']}/path", {'concepts':[{'id':graphs['concepts'][0]['id'],'title':'Stolen'}]}))[0], 422)
        self.assertEqual((await self.request('POST','/api/trees', {'title':'Broken','category':'Theology','goal':'Explain act','depth':'Conversational fluency','excludes':'','outcomes':['Explain act'],'concepts':[self.rich('Act', ['Explain act'], knowledge_id='missing')]}))[0], 422)
        code, found=await self.request('GET','/api/knowledge?q=model&subject=computer%20science')
        self.assertEqual(code, 200)
        self.assertTrue(any(item['title']=='Data & models' for item in found['matches']))

if __name__=='__main__': unittest.main()
