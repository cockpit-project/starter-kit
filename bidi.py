#!/usr/bin/python3

import asyncio
import json
import logging
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

import aiohttp

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


@dataclass
class Session:
    http: aiohttp.client.ClientSession
    ws: aiohttp.client.ClientWebSocketResponse
    session_url: str
    task_reader: asyncio.Task


class WebdriverBidi:
    def __init__(self, headless=False) -> None:
        self.headless = headless
        self.last_id = 0
        self.pending_commands: dict[int, asyncio.Future] = {}
        self.logs: list[LogMessage] = []
        self.session: Session | None = None
        self.future_wait_page_load = None

    async def start_session(self) -> None:
        raise NotImplementedError('must be implemented by concrete subclass')

    async def close_session(self) -> None:
        raise NotImplementedError('must be implemented by concrete subclass')

    async def close(self):
        assert self.session is not None
        logger.debug("cleaning up webdriver")

        self.session.task_reader.cancel()
        del self.session.task_reader
        await self.session.ws.close()
        await self.close_session()
        await self.session.http.close()
        self.session = None

    async def __aenter__(self):
        await self.start_session()
        return self

    async def __aexit__(self, *_excinfo):
        if self.session is not None:
            await self.close()

    async def ws_reader(self, ws: aiohttp.client.ClientWebSocketResponse) -> None:
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                data = json.loads(msg.data)
                logger.debug("ws TEXT → %r", data)
                if "id" in data and data["id"] in self.pending_commands:
                    logger.debug("ws_reader: resolving pending command %i", data["id"])
                    if data["type"] == "success":
                        self.pending_commands[data["id"]].set_result(data["result"])
                    else:
                        self.pending_commands[data["id"]].set_exception(
                            WebdriverError(f"{data['type']}: {data['message']}"))
                    del self.pending_commands[data["id"]]
                    continue

                if data["type"] == "event":
                    if data["method"] == "log.entryAdded":
                        self.logs.append(LogMessage(data["params"]))
                        continue
                    if data["method"] == "browsingContext.domContentLoaded":
                        logger.debug("page loaded: %r", data["params"])
                        if self.future_wait_page_load:
                            self.future_wait_page_load.set_result(data["params"]["url"])
                        continue

                logger.warning("ws_reader: unhandled message %r", data)
            elif msg.type == aiohttp.WSMsgType.ERROR:
                logger.error("BiDi failure: %s", msg)
                break

    async def bidi(self, method, **params) -> asyncio.Future:
        """Send a Webdriver BiDI command and return the JSON response"""

        assert self.session

        payload = json.dumps({"id": self.last_id, "method": method, "params": params})
        logger.debug("ws ← %r", payload)
        await self.session.ws.send_str(payload)
        future = asyncio.get_event_loop().create_future()
        self.pending_commands[self.last_id] = future
        self.last_id += 1
        return await future

    def arm_page_load(self):
        assert self.future_wait_page_load is None, "already waiting for page load"
        self.future_wait_page_load = asyncio.get_event_loop().create_future()

    async def wait_page_load(self):
        assert self.future_wait_page_load is not None, "call arm_page_load() first"
        return await self.future_wait_page_load

    async def run(self):
        # wait for browser to initialize default context
        for _ in range(10):
            realms = (await self.bidi("script.getRealms"))["realms"]
            if len(realms) > 0:
                context = realms[0]["context"]
                break
        else:
            raise WebdriverError("timed out waiting for default realm")

        await self.bidi("session.subscribe", events=[
            "log.entryAdded", "browsingContext.domContentLoaded",
        ])

        await self.bidi("script.evaluate", expression="console.log('Hello BiDi')",
                        awaitPromise=False, target={"context": context})
        await self.bidi("browsingContext.navigate", context=context,
                        url="https://piware.de", wait="complete")

        r = (await self.bidi("browsingContext.locateNodes", context=context,
                             locator={"type": "css", "value": "#menu-content"}))["nodes"]
        assert len(r) == 1

        r = await self.bidi("script.evaluate", expression="document.querySelector('#menu-content').textContent",
                            awaitPromise=False, target={"context": context})
        assert 'Addicted to Free Software Development' in r['result']['value']

        # locate first social link
        r = (await self.bidi("browsingContext.locateNodes", context=context,
                             locator={"type": "css", "value": "a[rel='me']:first-child"}))["nodes"]
        assert len(r) == 1

        self.arm_page_load()

        # click it
        await self.bidi("input.performActions", context=context, actions=[
            {
                "id": "pointer-0",
                "type": "pointer",
                "parameters": {"pointerType": "mouse"},
                "actions": [
                    {"type": "pointerMove", "x": 0, "y": 0, "origin": {"type": "element", "element": r[0]}},
                    {"type": "pointerDown", "button": 0},
                    {"type": "pointerUp", "button": 0},
                ],
            }
        ])

        url = await self.wait_page_load()
        assert url == "https://github.com/martinpitt/"

        logger.info("Collected debug messages:")
        for log in self.logs:
            logger.info(log)

        if not self.headless:
            await asyncio.sleep(3)


class ChromiumBidi(WebdriverBidi):
    async def start_session(self) -> None:
        assert self.session is None

        # TODO: make dynamic
        webdriver_port = 12345

        chrome_binary = "/usr/lib64/chromium-browser/headless_shell" if self.headless else "/usr/bin/chromium-browser"

        session_args = {"capabilities": {
            "alwaysMatch": {
                "webSocketUrl": True,
                "goog:chromeOptions": {"binary": chrome_binary},
            }
        }}

        self.driver = await asyncio.create_subprocess_exec("chromedriver", "--port=" + str(webdriver_port))

        aiohttp_session = aiohttp.ClientSession(raise_for_status=True)
        wd_url = f"http://localhost:{webdriver_port}"

        # webdriver needs some time to launch
        for retry in range(1, 10):
            try:
                async with aiohttp_session.post(f"{wd_url}/session",
                                                data=json.dumps(session_args).encode()) as resp:
                    session_info = json.loads(await resp.text())["value"]
                    logger.debug("webdriver session request: %r %r", resp, session_info)
                    break
            except (IOError, aiohttp.client.ClientResponseError) as e:
                logger.debug("waiting for webdriver: %s", e)
                await asyncio.sleep(0.1 * retry)
        else:
            raise WebdriverError("could not connect to chromedriver")

        ws = await aiohttp_session.ws_connect(session_info["capabilities"]["webSocketUrl"])

        self.session = Session(
            http=aiohttp_session,
            ws=ws,
            session_url=f"{wd_url}/session/{session_info['sessionId']}",
            task_reader=asyncio.create_task(self.ws_reader(ws), name="bidi_reader")
        )

        logger.debug("Established chromium session %r", self.session)

    async def close_session(self):
        await self.session.http.delete(self.session.session_url)
        self.driver.terminate()
        await self.driver.wait()


# We could do this with https://github.com/mozilla/geckodriver/releases with a similar protocol as ChromeBidi
# But let's use https://firefox-source-docs.mozilla.org/testing/marionette/Protocol.html directly, fewer moving parts
class FirefoxBidi(WebdriverBidi):
    async def start_session(self) -> None:
        # TODO: make dynamic
        marionette_port = 12345
        bidi_port = 12346

        self.homedir = tempfile.TemporaryDirectory(prefix="firefox-home-")
        (Path(self.homedir.name) / 'download').mkdir()
        self.profiledir = Path(self.homedir.name) / "profile"
        self.profiledir.mkdir()
        (self.profiledir / "user.js").write_text(f"""
            user_pref("remote.enabled", true);
            user_pref("remote.frames.enabled", true);
            user_pref("app.update.auto", false);
            user_pref("datareporting.policy.dataSubmissionEnabled", false);
            user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);
            user_pref("dom.disable_beforeunload", true);
            user_pref("browser.download.dir", "{self.homedir}/download");
            user_pref("browser.download.folderList", 2);
            user_pref("signon.rememberSignons", false);
            user_pref("dom.navigation.locationChangeRateLimit.count", 9999);
            // HACK: https://bugzilla.mozilla.org/show_bug.cgi?id=1746154
            user_pref("fission.webContentIsolationStrategy", 0);
            user_pref("fission.bfcacheInParent", false);
            user_pref('marionette.port', {marionette_port});
            """)

        self.driver = await asyncio.create_subprocess_exec(
            "firefox", "-profile", str(self.profiledir), "--marionette", "--no-remote",
            f"--remote-debugging-port={bidi_port}",
            *(["-headless"] if self.headless else []), "about:blank")

        # needs some time to launch
        for _ in range(1, 30):
            try:
                # we must keep this socket open throughout the lifetime of that session
                reader, self.writer_marionette = await asyncio.open_connection("127.0.0.1", marionette_port)
                break
            except ConnectionRefusedError as e:
                logger.debug("waiting for firefox marionette: %s", e)
                await asyncio.sleep(1)
        else:
            raise WebdriverError("could not connect to firefox marionette")

        reply = await reader.read(1024)
        if b'"marionetteProtocol":3' not in reply:
            raise WebdriverError(f"unexpected marionette reply: {reply.decode()}")
        cmd = '[0,1,"WebDriver:NewSession",{"webSocketUrl":true}]'
        self.writer_marionette.write(f"{len(cmd)}:{cmd}".encode())
        await self.writer_marionette.drain()
        reply = await reader.read(1024)
        # cut off length prefix
        reply = json.loads(reply[reply.index(b":") + 1:].decode())
        if not isinstance(reply, list) or len(reply) != 4 or not isinstance(reply[3], dict):
            raise WebdriverError(f"unexpected marionette session request reply: {reply!r}")
        logger.debug("marionette session request reply: %s", reply)

        aiohttp_session = aiohttp.ClientSession(raise_for_status=True)
        ws_url = reply[3]["capabilities"]["webSocketUrl"]
        ws = await aiohttp_session.ws_connect(ws_url)

        self.session = Session(
            http=aiohttp_session,
            ws=ws,
            session_url=ws_url,
            task_reader=asyncio.create_task(self.ws_reader(ws), name="bidi_reader")
        )

        logger.debug("Established firefox session %r", self.session)

    async def close_session(self):
        self.writer_marionette.close()
        await self.writer_marionette.wait_closed()
        self.driver.terminate()
        self.driver.wait()


async def main():
    logging.basicConfig(level=logging.DEBUG)
    cls = FirefoxBidi if len(sys.argv) > 1 and sys.argv[1] == "firefox" else ChromiumBidi
    async with cls(headless=True if len(sys.argv) > 2 and sys.argv[2] == 'headless' else False) as d:
        await d.run()


asyncio.run(main())
