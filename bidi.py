#!/usr/bin/python3

import asyncio
import base64
import json
import logging
import socket
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import aiohttp

log_proto = logging.getLogger("bidi.proto")
log_command = logging.getLogger("bidi.command")


class WebdriverError(RuntimeError):
    pass


# default timeout
TIMEOUT = 5  # TODO: raise to 15


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
class BidiSession:
    ws_url: str
    session_url: str
    process: asyncio.subprocess.Process


# Return port numbers that were free at the time of checking
# They might be in use again by the time the function returns...
def pick_ports(count: int) -> list[int]:
    sockets: list[socket.socket] = []
    ports: list[int] = []

    for _ in range(count):
        sock = socket.socket()
        sock.bind(('127.0.0.1', 0))
        sockets.append(sock)
        ports.append(sock.getsockname()[1])

    for s in sockets:
        s.close()

    return ports


def jsquote(js: object) -> str:
    return json.dumps(js)


class WebdriverBidi:
    def __init__(self, headless=False) -> None:
        self.headless = headless
        self.last_id = 0
        self.pending_commands: dict[int, asyncio.Future] = {}
        self.logs: list[LogMessage] = []
        self.bidi_session: BidiSession | None = None
        self.future_wait_page_load = None
        self.top_context: str | None = None  # top-level browsingContext
        self.context: str | None  # currently selected context (top or iframe)

    async def start_bidi_session(self) -> None:
        raise NotImplementedError('must be implemented by concrete subclass')

    async def close_bidi_session(self) -> None:
        raise NotImplementedError('must be implemented by concrete subclass')

    async def close(self):
        assert self.bidi_session is not None
        log_proto.debug("cleaning up webdriver")

        self.task_reader.cancel()
        del self.task_reader
        await self.ws.close()
        await self.close_bidi_session()
        self.bidi_session.process.terminate()
        await self.bidi_session.process.wait()
        self.bidi_session = None
        await self.http_session.close()

    def ws_done_callback(self, future):
        for fut in self.pending_commands.values():
            fut.set_exception(WebdriverError("websocket closed"))
        if not future.cancelled():
            log_proto.error("ws_reader crashed: %r", future.result())

    async def start_session(self) -> None:
        self.http_session = aiohttp.ClientSession(raise_for_status=True)
        await self.start_bidi_session()
        assert self.bidi_session
        self.ws = await self.http_session.ws_connect(self.bidi_session.ws_url)
        self.task_reader = asyncio.create_task(self.ws_reader(self.ws), name="bidi_reader")
        self.task_reader.add_done_callback(self.ws_done_callback)

        await self.bidi("session.subscribe", events=[
            "log.entryAdded", "browsingContext.domContentLoaded",
        ])

        test_functions = Path("test-functions.js").read_text()
        await self.bidi("script.addPreloadScript", functionDeclaration=f"() => {{ {test_functions} }}")

        # wait for browser to initialize default context
        for _ in range(10):
            realms = (await self.bidi("script.getRealms"))["realms"]
            if len(realms) > 0:
                self.top_context = realms[0]["context"]
                self.context = self.top_context
                break
        else:
            raise WebdriverError("timed out waiting for default realm")

        # avoid not seeing elements due to too small window
        # await self.bidi("browsingContext.setViewport", context=self.top_context,
        #                 viewport={"width": 1024, "height": 5000})

    async def __aenter__(self):
        await self.start_session()
        return self

    async def __aexit__(self, *_excinfo):
        if self.bidi_session is not None:
            await self.close()

    async def ws_reader(self, ws: aiohttp.client.ClientWebSocketResponse) -> None:
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                data = json.loads(msg.data)
                log_proto.debug("ws TEXT → %r", data)
                if "id" in data and data["id"] in self.pending_commands:
                    log_proto.debug("ws_reader: resolving pending command %i", data["id"])
                    if data["type"] == "success":
                        result = data["result"]
                        if result.get("type") == "exception":
                            self.pending_commands[data["id"]].set_exception(RuntimeError(result["exceptionDetails"]))
                        else:
                            self.pending_commands[data["id"]].set_result(result)
                    else:
                        self.pending_commands[data["id"]].set_exception(
                            WebdriverError(f"{data['type']}: {data['message']}"))
                    del self.pending_commands[data["id"]]
                    continue

                if data["type"] == "event":
                    if data["method"] == "log.entryAdded":
                        log = LogMessage(data["params"])
                        self.logs.append(log)
                        log_command.info(str(log))
                        continue
                    if data["method"] == "browsingContext.domContentLoaded":
                        if self.future_wait_page_load:
                            log_command.debug("page loaded: %r, resolving wait page load future", data["params"])
                            self.future_wait_page_load.set_result(data["params"]["url"])
                        else:
                            log_command.debug("page loaded: %r (not awaited)", data["params"])
                        continue
                    # if data["method"] == "script.realmCreated":
                    #     realms = await self.bidi("script.getRealms")
                    #     log_command.warning("XXX script.realmCreated new: %r", realms)

                log_proto.warning("ws_reader: unhandled message %r", data)
            elif msg.type == aiohttp.WSMsgType.ERROR:
                log_proto.error("BiDi failure: %s", msg)
                break

    async def bidi(self, method, **params) -> dict[str, Any]:
        """Send a Webdriver BiDi command and return the JSON response"""

        payload = json.dumps({"id": self.last_id, "method": method, "params": params})
        log_proto.debug("ws ← %r", payload)
        await self.ws.send_str(payload)
        future = asyncio.get_event_loop().create_future()
        self.pending_commands[self.last_id] = future
        self.last_id += 1
        # some calls can take very long (wait for condition);
        # safe-guard timeout for avoiding eternally hanging tests
        return await asyncio.wait_for(future, timeout=60)

    #
    # BiDi state tracking
    #

    def arm_page_load(self):
        assert self.future_wait_page_load is None, "already waiting for page load"
        self.future_wait_page_load = asyncio.get_event_loop().create_future()

    async def wait_page_load(self, timeout: int = TIMEOUT) -> str:
        assert self.future_wait_page_load is not None, "call arm_page_load() first"
        try:
            url = await asyncio.wait_for(self.future_wait_page_load, timeout=timeout)
            self.future_wait_page_load = None
            return url
        except asyncio.TimeoutError as e:
            raise ValueError("timed out waiting for page load") from e

    async def switch_to_frame(self, name: str) -> None:
        frame = await self.locate(f"iframe[name='{name}']")
        cw = await self.bidi("script.callFunction",
                             functionDeclaration="f => f.contentWindow",
                             arguments=[frame],
                             awaitPromise=False,
                             target={"context": self.top_context})
        self.context = cw["result"]["value"]["context"]
        log_command.debug("switch_to_frame(%s)", name)

    def switch_to_top(self) -> None:
        self.context = self.top_context
        log_command.debug("switch_to_top")

    #
    # High-level helpers
    #

    async def locate(self, selector: str) -> str:
        r = await self.bidi("browsingContext.locateNodes", context=self.context,
                            locator={"type": "css", "value": selector})
        nodes = r["nodes"]
        if len(nodes) == 0:
            raise ValueError(f"no element found for {selector}")
        if len(nodes) > 1:
            raise ValueError(f"selector {selector} is ambiguous: {nodes}")
        log_command.debug("locate(%s) = %r", selector, nodes[0])
        return nodes[0]

    async def wait(self, selector: str, timeout: int = TIMEOUT) -> None:
        log_command.debug("wait(%s)", selector)
        # FIXME: this is very inefficient; use our JS page helper with promise await
        last_error = None
        for _ in range(timeout * 10):
            try:
                n = await self.locate(selector)
                log_command.debug("wait(%s) success: %r", selector, n)
                return
            except (WebdriverError, ValueError, TimeoutError) as e:
                last_error = e
                await asyncio.sleep(0.1)
        else:
            raise ValueError(f"timed out waiting for {selector}: {last_error}")

    async def wait_js_cond(self, cond: str, error_description: str = "null") -> None:
        log_command.debug("wait_js_cond(%s)", cond)
        await self.bidi("script.evaluate",
                        expression=f"window.ph_wait_cond(() => {cond}, {TIMEOUT * 1000}, {error_description})",
                        awaitPromise=True, target={"context": self.context})

    async def text(self, selector: str) -> str:
        # there is no BiDi way of evaluating a script on a particular element or getting
        # the text of an element, so just use the standard `.textContent` web platform property
        # but first make sure the locator is unique
        await self.locate(selector)
        r = await self.bidi("script.evaluate", expression=f"document.querySelector('{selector}').textContent",
                            awaitPromise=False, target={"context": self.context})
        return r['result']['value']

    async def wait_text(self, selector: str, text: str) -> None:
        await self.wait(selector)
        await self.wait_js_cond(f"window.ph_text({jsquote(selector)}) === {jsquote(text)}",
                                error_description=f"() => 'actual text: ' + window.ph_text({jsquote(selector)})")

    async def mouse(self, selector: str, button: int = 0, click_count: int = 1) -> None:
        element = await self.locate(selector)

        actions = [{"type": "pointerMove", "x": 0, "y": 0, "origin": {"type": "element", "element": element}}]
        for _ in range(click_count):
            actions.append({"type": "pointerDown", "button": button})
            actions.append({"type": "pointerUp", "button": button})

        await self.bidi("input.performActions", context=self.context, actions=[
            {
                "id": "pointer-0",
                "type": "pointer",
                "parameters": {"pointerType": "mouse"},
                "actions": actions,
            }
        ])

    async def key(self, value: str) -> None:
        await self.bidi("input.performActions", context=self.context, actions=[{
                "type": "key", "id": "key-0", "actions": [
                    {"type": "keyDown", "value": value},
                    {"type": "keyUp", "value": value},
                ]}])

    async def input_text(self, text: str) -> None:
        actions = []
        for c in text:
            actions.append({"type": "keyDown", "value": c})
            actions.append({"type": "keyUp", "value": c})
        await self.bidi("input.performActions", context=self.context, actions=[
            {"type": "key", "id": "key-0", "actions": actions}])

    async def focus(self, selector: str) -> None:
        await self.locate(selector)
        await self.bidi("script.evaluate", expression=f"document.querySelector('{selector}').focus()",
                        awaitPromise=False, target={"context": self.context})

    async def set_input_text(self, selector: str, text: str) -> None:
        await self.focus(selector)
        await self.input_text(text)
        # TODO: wait for text
        await asyncio.sleep(0.2)


class ChromiumBidi(WebdriverBidi):
    async def start_bidi_session(self) -> None:
        assert self.bidi_session is None

        chrome_binary = "/usr/lib64/chromium-browser/headless_shell" if self.headless else "/usr/bin/chromium-browser"

        session_args = {"capabilities": {
            "alwaysMatch": {
                "webSocketUrl": True,
                "goog:chromeOptions": {"binary": chrome_binary},
            }
        }}

        [webdriver_port] = pick_ports(1)
        driver = await asyncio.create_subprocess_exec("chromedriver", "--port=" + str(webdriver_port))

        wd_url = f"http://localhost:{webdriver_port}"

        # webdriver needs some time to launch
        for retry in range(1, 10):
            try:
                async with self.http_session.post(f"{wd_url}/session",
                                                  data=json.dumps(session_args).encode()) as resp:
                    session_info = json.loads(await resp.text())["value"]
                    log_proto.debug("webdriver session request: %r %r", resp, session_info)
                    break
            except (IOError, aiohttp.client.ClientResponseError) as e:
                log_proto.debug("waiting for webdriver: %s", e)
                await asyncio.sleep(0.1 * retry)
        else:
            raise WebdriverError("could not connect to chromedriver")

        self.bidi_session = BidiSession(
            session_url=f"{wd_url}/session/{session_info['sessionId']}",
            ws_url=session_info["capabilities"]["webSocketUrl"],
            process=driver)
        log_proto.debug("Established chromium session %r", self.bidi_session)

    async def close_bidi_session(self):
        await self.http_session.delete(self.bidi_session.session_url)


# We could do this with https://github.com/mozilla/geckodriver/releases with a similar protocol as ChromeBidi
# But let's use https://firefox-source-docs.mozilla.org/testing/marionette/Protocol.html directly, fewer moving parts
class FirefoxBidi(WebdriverBidi):
    async def start_bidi_session(self) -> None:
        [marionette_port, bidi_port] = pick_ports(2)

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

        driver = await asyncio.create_subprocess_exec(
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
                log_proto.debug("waiting for firefox marionette: %s", e)
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
        log_proto.debug("marionette session request reply: %s", reply)

        url = reply[3]["capabilities"]["webSocketUrl"]
        self.bidi_session = BidiSession(session_url=url, ws_url=url, process=driver)
        log_proto.debug("Established firefox session %r", self.bidi_session)

    async def close_bidi_session(self):
        self.writer_marionette.close()
        await self.writer_marionette.wait_closed()


async def main():
    logging.basicConfig(level=logging.DEBUG)
    log_proto.setLevel(logging.DEBUG)
    log_command.setLevel(logging.DEBUG)

    headless = True if len(sys.argv) > 2 and sys.argv[2] == 'headless' else False
    cls = FirefoxBidi if len(sys.argv) > 1 and sys.argv[1] == "firefox" else ChromiumBidi

    async with cls(headless=headless) as d:
        await d.bidi("script.evaluate", expression="console.log('Hello BiDi')",
                     awaitPromise=False, target={"context": d.context})
        await d.bidi("browsingContext.navigate", context=d.context,
                     url="http://127.0.0.2:9091", wait="complete")

        print("\n\nSTEP: logging in")
        await d.set_input_text("#login-user-input", "admin")
        await d.set_input_text("#login-password-input", "foobar")

        # d.arm_page_load()
        # await d.key("Enter")  # FIXME: this doesn't work: Neither with Return nor \n
        await d.mouse("#login-button")

        # this is optional: wait() can wait across page loads
        # print("\n\nSTEP: waiting for page load")
        # await d.wait_page_load()

        print("\n\nSTEP: super-user-indicator")
        try:
            await d.wait_text("#super-user-indicator", "Limited access")
        except ValueError:
            s = await d.bidi("browsingContext.captureScreenshot", context=d.top_context, origin="document")
            Path("screenshot.png").write_bytes(base64.b64decode(s["data"]))
            raise

        print("\n\nSTEP: wait/switch frame")
        await d.switch_to_frame('cockpit1:localhost/system')

        print("\n\nSTEP: inspect system frame")
        await d.wait(".system-configuration")
        t = await d.text(".system-configuration")
        assert "Join domain" in t, t

        log_command.info("Collected debug messages:")
        for log in d.logs:
            log_command.info(log)


asyncio.run(main())
