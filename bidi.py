import json
import logging
import subprocess
import time
import urllib.request

import asyncio
import websockets


logger = logging.getLogger(__name__)


class WebdriverError(RuntimeError):
    pass


class WebdriverBidi:
    def __init__(self, browser) -> None:
        # TODO: make dynamic
        self.webdriver_port = 12345
        self.webdriver_url = f"http://localhost:{self.webdriver_port}"

        session_args = {"capabilities": {
            "alwaysMatch": {
                "webSocketUrl": True,
                "goog:chromeOptions": {"binary": "/usr/bin/chromium-browser"},
            }
        }}

        if browser == 'chromium':
            # add --verbose for debugging
            self.driver = subprocess.Popen(["chromedriver", "--port=" + str(self.webdriver_port)])
        elif browser == 'firefox':
            # TODO: not packaged, get from https://github.com/mozilla/geckodriver/releases
            self.driver = subprocess.Popen(["/tmp/geckodriver", "--port", str(self.webdriver_port)])
        else:
            raise ValueError(f"unknown browser {browser}")

        req = urllib.request.Request(
                f"{self.webdriver_url}/session",
                json.dumps(session_args).encode(),
                headers={"Content-Type": "application/json"})
        # webdriver needs some time to launch
        for retry in range(1, 10):
            try:
                with urllib.request.urlopen(req) as f:
                    resp = json.load(f)
                    break
            except urllib.error.URLError as e:
                logger.debug("waiting for webdriver: %s", e)
                time.sleep(0.1 * retry)
        else:
            raise WebdriverError("could not connect to webdriver")

        self.session_info = resp["value"]
        self.last_id = 0
        self.ws = None
        self.pending_commands: dict[int, asyncio.Future] = {}

    async def ws_reader(self) -> None:
        assert self.ws
        while True:
            try:
                ret = json.loads(await self.ws.recv())
            except websockets.exceptions.ConnectionClosedOK:
                logger.debug("ws_reader connection closed")
                break
            logger.debug("ws → %r", ret)
            if ret["id"] in self.pending_commands:
                logger.debug("ws_reader: resolving pending command %i", ret["id"])
                if ret["type"] == "success":
                    self.pending_commands[ret["id"]].set_result(ret["result"])
                else:
                    self.pending_commands[ret["id"]].set_exception(WebdriverError(f"{ret['type']}: {ret['message']}"))
                del self.pending_commands[ret["id"]]

    async def command(self, method, **params) -> asyncio.Future:
        assert self.ws
        payload = json.dumps({"id": self.last_id, "method": method, "params": params})
        logger.debug("ws ← %r", payload)
        await self.ws.send(payload)
        future = asyncio.get_event_loop().create_future()
        self.pending_commands[self.last_id] = future
        self.last_id += 1
        return await future

    async def run(self):
        # open bidi websocket for session
        async with websockets.connect(self.session_info["capabilities"]["webSocketUrl"]) as ws:
            self.ws = ws
            self.task_reader = asyncio.create_task(self.ws_reader(), name="bidi_reader")

            await self.command("session.subscribe", events=["log.entryAdded"])
            context = (await self.command("browsingContext.create", type="tab"))["context"]
            await self.command("browsingContext.navigate", context=context, url="https://piware.de")

            await asyncio.sleep(5)
            self.task_reader.cancel()
            del self.task_reader

    def __del__(self):
        logger.debug("cleaning up webdriver")
        urllib.request.urlopen(urllib.request.Request(
            f"{self.webdriver_url}/session/{self.session_info['sessionId']}", method="DELETE"))

        self.driver.terminate()
        self.driver.wait()


logging.basicConfig(level=logging.DEBUG)
d = WebdriverBidi("chromium")  # or firefox
asyncio.run(d.run())
