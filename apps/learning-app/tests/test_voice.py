import json
import unittest
from unittest.mock import patch
from fastapi import HTTPException
from starlette.requests import Request
from app import voice

class VoiceTests(unittest.IsolatedAsyncioTestCase):
    def request(self, body, origin='http://localhost:8009'):
        async def receive():
            return {'type':'http.request','body':json.dumps(body).encode(),'more_body':False}
        return Request({'type':'http','headers':[(b'host',b'localhost:8009'),(b'origin',origin.encode())]}, receive)

    async def test_saved_context_and_recap_tool_reach_live(self):
        with patch.dict('os.environ', {'OPENAI_API_KEY':'test-only'}), patch.object(voice,'post_json', return_value=b'{"transport":{"sdp":"answer"}}') as post:
            response=await voice.negotiate(self.request({'sdp':'v=0','voice':'cedar'}), {'prompt':'Saved lesson session abc, concept models'})
        payload=post.call_args.args[2]['session']
        self.assertIn('session abc',payload['instructions'])
        self.assertEqual(payload['audio']['output']['voice'],'cedar')
        self.assertIn('propose_recap',[t['name'] for t in payload['delegation']['responses']['tools']])
        self.assertEqual(response.status_code,200)

    async def test_realtime_receives_context(self):
        with patch.dict('os.environ', {'OPENAI_API_KEY':'test-only'}), patch.object(voice,'post_multipart',return_value=b'v=0') as post:
            await voice.negotiate(self.request({'engine':'realtime','sdp':'v=0'}),{'prompt':'lesson xyz'})
        options=json.loads(post.call_args.args[2]['session'])
        self.assertIn('lesson xyz', options['instructions'])
        self.assertIn('propose_recap',[t['name'] for t in options['tools']])

    async def test_invalid_requests_never_call_provider(self):
        with patch.object(voice,'post_json') as post:
            for body,origin,code in [({},'https://other.example',403),([], 'http://localhost:8009',422),({'engine':'bad'},'http://localhost:8009',422)]:
                with self.assertRaises(HTTPException) as error:
                    await voice.negotiate(self.request(body,origin),{'prompt':'lesson'})
                self.assertEqual(error.exception.status_code,code)
            post.assert_not_called()

    def test_only_public_assets_served(self):
        for path in ['../app/main.py','config.json','server.mjs']:
            with self.assertRaises(HTTPException):voice.voice_asset(path)
        self.assertIn(b'/voice/app.js',voice.voice_page().body)
