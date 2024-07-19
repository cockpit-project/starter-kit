import asyncio
import json
import logging
import subprocess
import time
import urllib.request
from dataclasses import dataclass

import websockets

logger = logging.getLogger(__name__)


class WebdriverError(RuntimeError):
    pass


@dataclass
class LogMessage:
    level: str  # like "info"
    type: str  # usually "console"
    timestamp: int
    args: list[object]
    text: str

    def __init__(self, message_params):
        self.level = message_params["level"]
        self.type = message_params["type"]
        self.timestamp = message_params["timestamp"]
        self.args = message_params.get("args", [])
        self.text = message_params["text"]

    def __str__(self):
        return f"LogMessage: {self.type} {self.level} @{self.timestamp}: {self.text} {self.args}"


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
        self.logs: list[LogMessage] = []

    async def ws_reader(self) -> None:
        assert self.ws
        while True:
            try:
                msg = json.loads(await self.ws.recv())
            except websockets.exceptions.ConnectionClosedOK:
                logger.debug("ws_reader connection closed")
                break
            logger.debug("ws → %r", msg)
            if "id" in msg and msg["id"] in self.pending_commands:
                logger.debug("ws_reader: resolving pending command %i", msg["id"])
                if msg["type"] == "success":
                    self.pending_commands[msg["id"]].set_result(msg["result"])
                else:
                    self.pending_commands[msg["id"]].set_exception(WebdriverError(f"{msg['type']}: {msg['message']}"))
                del self.pending_commands[msg["id"]]
                continue

            if msg["type"] == "event":
                if msg["method"] == "log.entryAdded":
                    self.logs.append(LogMessage(msg["params"]))
                    continue

            logger.warning("ws_reader: unhandled message %r", msg)

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
            await self.command("script.evaluate", expression="console.log('Hello BiDi')",
                               awaitPromise=False, target={"context": context})
            await self.command("browsingContext.navigate", context=context, url="https://piware.de")

            await asyncio.sleep(5)
            self.task_reader.cancel()
            del self.task_reader

    def __del__(self):
        logger.debug("cleaning up webdriver")
        urllib.request.urlopen(urllib.request.Request(
            f"{self.webdriver_url}/session/{self.session_info['sessionId']}", method="DELETE"))

        logger.info("Collected debug messages:")
        for log in self.logs:
            logger.info(log)

        self.driver.terminate()
        self.driver.wait()


logging.basicConfig(level=logging.DEBUG)
d = WebdriverBidi("chromium")  # or firefox
asyncio.run(d.run())
