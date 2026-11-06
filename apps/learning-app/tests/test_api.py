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

    async def request(self,method,path,body=None):
        payload=json.dumps(body).encode() if body is not None else b''
        output=[]
        async def receive(): return {'type':'http.request','body':payload,'more_body':False}
        async def send(message): output.append(message)
        await main.app({'type':'http','asgi':{'version':'3.0'},'http_version':'1.1','method':method,'scheme':'http','path':path,'raw_path':path.encode(),'query_string':b'','headers':[(b'content-type',b'application/json')],'server':('test',80),'client':('test',1),'root_path':''},receive,send)
        status=next(m['status'] for m in output if m['type']=='http.response.start')
        raw=b''.join(m.get('body',b'') for m in output if m['type']=='http.response.body')
        return status,json.loads(raw) if raw else None

    async def recap(self):
        code,s=await self.request('POST','/api/trees/ml/sessions',{'concept_id':'models'})
        self.assertEqual(code,200)
        self.assertIn(s['id'],s['prompt'])
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

if __name__=='__main__': unittest.main()
