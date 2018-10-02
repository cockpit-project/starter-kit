/*
* This file is part of Cockpit.
*
* Copyright (C) 2017 Red Hat, Inc.
*
* Cockpit is free software; you can redistribute it and/or modify it
* under the terms of the GNU Lesser General Public License as published by
* the Free Software Foundation; either version 2.1 of the License, or
* (at your option) any later version.
*
* Cockpit is distributed in the hope that it will be useful, but
* WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
* Lesser General Public License for more details.
*
* You should have received a copy of the GNU Lesser General Public License
* along with Cockpit; If not, see <http://www.gnu.org/licenses/>.
*/
"use strict";
import React from 'react';
let cockpit = require("cockpit");
let _ = cockpit.gettext;
let Term = require("term.js-cockpit");
let Journal = require("journal");
let $ = require("jquery");
require("console.css");

/*
 * Get an object field, verifying its presence and type.
 */
let getValidField = function (object, field, type) {
    let value;
    if (!(field in object)) {
        throw Error("\"" + field + "\" field is missing");
    }
    value = object[field];
    if (typeof (value) != typeof (type)) {
        throw Error("invalid \"" + field + "\" field type: " + typeof (value));
    }
    return value;
};

let scrollToBottom = function(id) {
    const el = document.getElementById(id);
    if (el) {
        el.scrollTop = el.scrollHeight;
    }
};

/*
 * An auto-loading buffer of recording's packets.
 */
let PacketBuffer = class {
    /*
     * Initialize a buffer.
     */
    constructor(matchList) {
        this.handleError = this.handleError.bind(this);
        this.handleStream = this.handleStream.bind(this);
        this.handleDone = this.handleDone.bind(this);
        /* RegExp used to parse message's timing field */
        this.timingRE = new RegExp(
            /* Delay (1) */
            "\\+(\\d+)|" +
                                /* Text input (2) */
                                "<(\\d+)|" +
                                /* Binary input (3, 4) */
                                "\\[(\\d+)/(\\d+)|" +
                                /* Text output (5) */
                                ">(\\d+)|" +
                                /* Binary output (6, 7) */
                                "\\](\\d+)/(\\d+)|" +
                                /* Window (8, 9) */
                                "=(\\d+)x(\\d+)|" +
                                /* End of string */
                                "$",
            /* Continue after the last match only */
            /* FIXME Support likely sparse */
            "y"
        );
        /* List of matches to apply when loading the buffer from Journal */
        this.matchList = matchList;
        /*
         * An array of two-element arrays (tuples) each containing a
         * packet index and a deferred object. The list is kept sorted to
         * have tuples with lower packet indices first. Once the buffer
         * receives a packet at the specified index, the matching tuple is
         * removed from the list, and its deferred object is resolved.
         * This is used to keep users informed about packets arriving.
         */
        this.idxDfdList = [];
        /* Last seen message ID */
        this.id = 0;
        /* Last seen time position */
        this.pos = 0;
        /* Last seen window width */
        this.width = null;
        /* Last seen window height */
        this.height = null;
        /* List of packets read */
        this.pktList = [];
        /* Error which stopped the loading */
        this.error = null;
        /* The journalctl reading the recording */
        this.journalctl = Journal.journalctl(
            this.matchList,
            {count: "all", follow: false});
        this.journalctl.fail(this.handleError);
        this.journalctl.stream(this.handleStream);
        this.journalctl.done(this.handleDone);
        /*
         * Last seen cursor of the first, non-follow, journalctl run.
         * Null if no entry was received yet, or the second run has
         * skipped the entry received last by the first run.
         */
        this.cursor = null;
        /* True if the first, non-follow, journalctl run has completed */
        this.done = false;
    }

    /*
     * Return a promise which is resolved when a packet at a particular
     * index is received by the buffer. The promise is rejected with a
     * non-null argument if an error occurs or has occurred previously.
     * The promise is rejected with null, when the buffer is stopped. If
     * the packet index is not specified, assume it's the next packet.
     */
    awaitPacket(idx) {
        let i;
        let idxDfd;

        /* If an error has occurred previously */
        if (this.error !== null) {
            /* Reject immediately */
            return $.Deferred().reject(this.error)
                    .promise();
        }

        /* If the buffer was stopped */
        if (this.journalctl === null) {
            return $.Deferred().reject(null)
                    .promise();
        }

        /* If packet index is not specified */
        if (idx === undefined) {
            /* Assume it's the next one */
            idx = this.pktList.length;
        } else {
            /* If it has already been received */
            if (idx < this.pktList.length) {
                /* Return resolved promise */
                return $.Deferred().resolve()
                        .promise();
            }
        }

        /* Try to find an existing, matching tuple */
        for (i = 0; i < this.idxDfdList.length; i++) {
            idxDfd = this.idxDfdList[i];
            if (idxDfd[0] == idx) {
                return idxDfd[1].promise();
            } else if (idxDfd[0] > idx) {
                break;
            }
        }

        /* Not found, create and insert a new tuple */
        idxDfd = [idx, $.Deferred()];
        this.idxDfdList.splice(i, 0, idxDfd);

        /* Return its promise */
        return idxDfd[1].promise();
    }

    /*
     * Return true if the buffer was done loading everything logged to
     * journal so far and is now waiting for and loading new entries.
     * Return false if the buffer is loading existing entries so far.
     */
    isDone() {
        return this.done;
    }

    /*
     * Stop receiving the entries
     */
    stop() {
        if (this.journalctl === null) {
            return;
        }
        /* Destroy journalctl */
        this.journalctl.stop();
        this.journalctl = null;
        /* Notify everyone we stopped */
        for (let i = 0; i < this.idxDfdList.length; i++) {
            this.idxDfdList[i][1].reject(null);
        }
        this.idxDfdList = [];
    }

    /*
     * Add a packet to the received packet list.
     */
    addPacket(pkt) {
        /* TODO Validate the packet */
        /* Add the packet */
        this.pktList.push(pkt);
        /* Notify any matching listeners */
        while (this.idxDfdList.length > 0) {
            let idxDfd = this.idxDfdList[0];
            if (idxDfd[0] < this.pktList.length) {
                this.idxDfdList.shift();
                idxDfd[1].resolve();
            } else {
                break;
            }
        }
    }

    /*
     * Handle an error.
     */
    handleError(error) {
        /* Remember the error */
        this.error = error;
        /* Destroy journalctl, don't try to recover */
        if (this.journalctl !== null) {
            this.journalctl.stop();
            this.journalctl = null;
        }
        /* Notify everyone we had an error */
        for (let i = 0; i < this.idxDfdList.length; i++) {
            this.idxDfdList[i][1].reject(error);
        }
        this.idxDfdList = [];
    }

    /*
     * Parse packets out of a tlog message data and add them to the buffer.
     */
    parseMessageData(timing, in_txt, out_txt) {
        let matches;
        let in_txt_pos = 0;
        let out_txt_pos = 0;
        let t;
        let x;
        let y;
        let s;
        let io = [];
        let is_output;

        /* While matching entries in timing */
        this.timingRE.lastIndex = 0;
        for (;;) {
            /* Match next timing entry */
            matches = this.timingRE.exec(timing);
            if (matches === null) {
                throw Error("invalid timing string");
            } else if (matches[0] == "") {
                break;
            }

            /* Switch on entry type character */
            switch (t = matches[0][0]) {
            /* Delay */
            case "+":
                x = parseInt(matches[1], 10);
                if (x == 0) {
                    break;
                }
                if (io.length > 0) {
                    this.addPacket({pos: this.pos,
                                    is_io: true,
                                    is_output: is_output,
                                    io: io.join()});
                    io = [];
                }
                this.pos += x;
                break;
                /* Text or binary input */
            case "<":
            case "[":
                x = parseInt(matches[(t == "<") ? 2 : 3], 10);
                if (x == 0) {
                    break;
                }
                if (io.length > 0 && is_output) {
                    this.addPacket({pos: this.pos,
                                    is_io: true,
                                    is_output: is_output,
                                    io: io.join()});
                    io = [];
                }
                is_output = false;
                /* Add (replacement) input characters */
                s = in_txt.slice(in_txt_pos, in_txt_pos += x);
                if (s.length != x) {
                    throw Error("timing entry out of input bounds");
                }
                io.push(s);
                break;
                /* Text or binary output */
            case ">":
            case "]":
                x = parseInt(matches[(t == ">") ? 5 : 6], 10);
                if (x == 0) {
                    break;
                }
                if (io.length > 0 && !is_output) {
                    this.addPacket({pos: this.pos,
                                    is_io: true,
                                    is_output: is_output,
                                    io: io.join()});
                    io = [];
                }
                is_output = true;
                /* Add (replacement) output characters */
                s = out_txt.slice(out_txt_pos, out_txt_pos += x);
                if (s.length != x) {
                    throw Error("timing entry out of output bounds");
                }
                io.push(s);
                break;
                /* Window */
            case "=":
                x = parseInt(matches[8], 10);
                y = parseInt(matches[9], 10);
                if (x == this.width && y == this.height) {
                    break;
                }
                if (io.length > 0) {
                    this.addPacket({pos: this.pos,
                                    is_io: true,
                                    is_output: is_output,
                                    io: io.join()});
                    io = [];
                }
                this.addPacket({pos: this.pos,
                                is_io: false,
                                width: x,
                                height: y});
                this.width = x;
                this.height = y;
                break;
            }
        }

        if (in_txt_pos < in_txt.length) {
            throw Error("extra input present");
        }
        if (out_txt_pos < out_txt.length) {
            throw Error("extra output present");
        }

        if (io.length > 0) {
            this.addPacket({pos: this.pos,
                            is_io: true,
                            is_output: is_output,
                            io: io.join()});
        }
    }

    /*
     * Parse packets out of a tlog message and add them to the buffer.
     */
    parseMessage(message) {
        let matches;
        let ver;
        let id;
        let pos;

        const number = Number();
        const string = String();

        /* Check version */
        ver = getValidField(message, "ver", string);
        matches = ver.match("^(\\d+)\\.(\\d+)$");
        if (matches === null || matches[1] > 2) {
            throw Error("\"ver\" field has invalid value: " + ver);
        }

        /* TODO Perhaps check host, rec, user, term, and session fields */

        /* Extract message ID */
        id = getValidField(message, "id", number);
        if (id <= this.id) {
            throw Error("out of order \"id\" field value: " + id);
        }

        /* Extract message time position */
        pos = getValidField(message, "pos", number);
        if (pos < this.message_pos) {
            throw Error("out of order \"pos\" field value: " + pos);
        }

        /* Update last received message ID and time position */
        this.id = id;
        this.pos = pos;

        /* Parse message data */
        this.parseMessageData(
            getValidField(message, "timing", string),
            getValidField(message, "in_txt", string),
            getValidField(message, "out_txt", string));
    }

    /*
     * Handle journalctl "stream" event.
     */
    handleStream(entryList) {
        let i;
        let e;
        for (i = 0; i < entryList.length; i++) {
            e = entryList[i];
            /* If this is the second, "follow", run */
            if (this.done) {
                /* Skip the last entry we added on the first run */
                if (this.cursor !== null) {
                    this.cursor = null;
                    continue;
                }
            } else {
                if (!('__CURSOR' in e)) {
                    this.handleError("No cursor in a Journal entry");
                }
                this.cursor = e['__CURSOR'];
            }
            /* TODO Refer to entry number/cursor in errors */
            if (!('MESSAGE' in e)) {
                this.handleError("No message in Journal entry");
            }
            /* Parse the entry message */
            try {
                this.parseMessage(JSON.parse(e['MESSAGE']));
            } catch (error) {
                this.handleError(error);
                return;
            }
        }
    }

    /*
     * Handle journalctl "done" event.
     */
    handleDone() {
        this.done = true;
        if (this.journalctl !== null) {
            this.journalctl.stop();
            this.journalctl = null;
        }
        /* Continue with the "following" run  */
        this.journalctl = Journal.journalctl(
            this.matchList,
            {cursor: this.cursor,
             follow: true, count: "all"});
        this.journalctl.fail(this.handleError);
        this.journalctl.stream(this.handleStream);
        /* NOTE: no "done" handler on purpose */
    }
};

let ProgressBar = class extends React.Component {
    constructor(props) {
        super(props);
        this.jumpTo = this.jumpTo.bind(this);
    }

    jumpTo(e) {
        if (this.props.fastForwardFunc) {
            let percent = parseInt((e.nativeEvent.offsetX * 100) / e.currentTarget.clientWidth);
            let ts = parseInt((this.props.length * percent) / 100);
            this.props.fastForwardFunc(ts);
        }
    }

    render() {
        let progress = {
            "width": parseInt((this.props.mark * 100) / this.props.length) + "%"
        };

        return (
            <div id="progress_bar" className="progress" onClick={this.jumpTo}>
                <div className="progress-bar" role="progressbar" style={progress} />
            </div>
        );
    }
};

class InputPlayer extends React.Component {
    render() {
        const input = String(this.props.input).replace(/(?:\r\n|\r|\n)/g, " ");

        return (
            <textarea name="input" id="input-textarea" cols="30" rows="1" value={input} readOnly disabled />
        );
    }
}

export class Player extends React.Component {
    constructor(props) {
        super(props);
        this.handleTimeout = this.handleTimeout.bind(this);
        this.handlePacket = this.handlePacket.bind(this);
        this.handleError = this.handleError.bind(this);
        this.handleTitleChange = this.handleTitleChange.bind(this);
        this.rewindToStart = this.rewindToStart.bind(this);
        this.playPauseToggle = this.playPauseToggle.bind(this);
        this.speedUp = this.speedUp.bind(this);
        this.speedDown = this.speedDown.bind(this);
        this.speedReset = this.speedReset.bind(this);
        this.fastForwardToEnd = this.fastForwardToEnd.bind(this);
        this.skipFrame = this.skipFrame.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.sync = this.sync.bind(this);
        this.zoomIn = this.zoomIn.bind(this);
        this.zoomOut = this.zoomOut.bind(this);
        this.fitTo = this.fitTo.bind(this);
        this.dragPan = this.dragPan.bind(this);
        this.dragPanEnable = this.dragPanEnable.bind(this);
        this.dragPanDisable = this.dragPanDisable.bind(this);
        this.zoom = this.zoom.bind(this);
        this.fastForwardToTS = this.fastForwardToTS.bind(this);
        this.sendInput = this.sendInput.bind(this);
        this.clearInputPlayer = this.clearInputPlayer.bind(this);

        this.state = {
            cols:               80,
            rows:               25,
            title:              _("Player"),
            term:               null,
            paused:             true,
            /* Speed exponent */
            speedExp:           0,
            container_width:    630,
            scale_initial:      1,
            scale_lock:         false,
            term_top_style:     "50%",
            term_left_style:    "50%",
            term_translate:     "-50%, -50%",
            term_scroll:        "hidden",
            term_zoom_max:      false,
            term_zoom_min:      false,
            drag_pan:           false,
            containerWidth: 630,
            currentTsPost:  0,
            scale:          1,
            error:          null,
            input:          "",
            mark:           0,
        };

        this.containerHeight = 290;

        /* Auto-loading buffer of recording's packets */
        this.buf = new PacketBuffer(this.props.matchList);

        /* Current recording time, ms */
        this.recTS = 0;
        /* Corresponding local time, ms */
        this.locTS = 0;

        /* Index of the current packet */
        this.pktIdx = 0;
        /* Current packet, or null if not retrieved */
        this.pkt = null;
        /* Timeout ID of the current packet, null if none */
        this.timeout = null;

        /* True if the next packet should be output without delay */
        this.skip = false;
        /* Playback speed */
        this.speed = 1;
        /*
         * Timestamp playback should fast-forward to.
         * Recording time, ms, or null if not fast-forwarding.
         */
        this.fastForwardTo = null;
    }

    reset() {
        /* Clear any pending timeouts */
        this.clearTimeout();

        /* Reset the terminal */
        this.state.term.reset();

        /* Move to beginning of buffer */
        this.pktIdx = 0;
        /* No packet loaded */
        this.pkt = null;

        /* We are not skipping */
        this.skip = false;
        /* We are not fast-forwarding */
        this.fastForwardTo = null;

        /* Move to beginning of recording */
        this.recTS = 0;
        this.setState({currentTsPost: parseInt(this.recTS)});
        /* Start the playback time */
        this.locTS = performance.now();

        /* Wait for the first packet */
        this.awaitPacket(0);
    }

    /* Subscribe for a packet at specified index */
    awaitPacket(idx) {
        this.buf.awaitPacket(idx).done(this.handlePacket)
                .fail(this.handleError);
    }

    /* Set next packet timeout, ms */
    setTimeout(ms) {
        this.timeout = window.setTimeout(this.handleTimeout, ms);
    }

    /* Clear next packet timeout */
    clearTimeout() {
        if (this.timeout !== null) {
            window.clearTimeout(this.timeout);
            this.timeout = null;
        }
    }

    /* Handle packet retrieval error */
    handleError(error) {
        if (error !== null) {
            this.setState({error: error});
            console.warn(error);
        }
    }

    /* Handle packet retrieval success */
    handlePacket() {
        this.sync();
    }

    /* Handle arrival of packet output time */
    handleTimeout() {
        this.timeout = null;
        this.sync();
    }

    /* Handle terminal title change */
    handleTitleChange(title) {
        this.setState({ title: _("Player") + ": " + title });
    }

    _transform(width, height) {
        var relation = Math.min(
            this.state.containerWidth / this.state.term.element.offsetWidth,
            this.containerHeight / this.state.term.element.offsetHeight
        );
        this.setState({
            term_top_style: "50%",
            term_left_style: "50%",
            term_translate: "-50%, -50%",
            scale: relation,
            scale_initial: relation,
            cols: width,
            rows: height
        });
    }

    sendInput(pkt) {
        if (pkt) {
            const current_input = this.state.input;
            this.setState({input: current_input + pkt.io});
        }
    }

    /* Synchronize playback */
    sync() {
        let locDelay;

        /* We are already called, don't call us with timeout */
        this.clearTimeout();

        /* Forever */
        for (;;) {
            /* Get another packet to output, if none */
            for (; this.pkt === null; this.pktIdx++) {
                let pkt = this.buf.pktList[this.pktIdx];
                /* If there are no more packets */
                if (pkt === undefined) {
                    /*
                     * If we're done loading existing packets and we were
                     * fast-forwarding.
                     */
                    if (this.fastForwardTo != null && this.buf.isDone()) {
                        /* Stop fast-forwarding */
                        this.fastForwardTo = null;
                    }
                    /* Call us when we get one */
                    this.awaitPacket();
                    return;
                }

                this.pkt = pkt;
            }

            /* Get the current local time */
            let nowLocTS = performance.now();

            /* Ignore the passed time, if we're paused */
            if (this.state.paused) {
                locDelay = 0;
            } else {
                locDelay = nowLocTS - this.locTS;
            }

            /* Sync to the local time */
            this.locTS = nowLocTS;

            /* If we are skipping one packet's delay */
            if (this.skip) {
                this.skip = false;
                this.recTS = this.pkt.pos;
            /* Else, if we are fast-forwarding */
            } else if (this.fastForwardTo !== null) {
                /* If we haven't reached fast-forward destination */
                if (this.pkt.pos < this.fastForwardTo) {
                    this.recTS = this.pkt.pos;
                } else {
                    this.recTS = this.fastForwardTo;
                    this.fastForwardTo = null;
                    continue;
                }
            /* Else, if we are paused */
            } else if (this.state.paused) {
                return;
            } else {
                this.recTS += locDelay * this.speed;
                let pktRecDelay = this.pkt.pos - this.recTS;
                let pktLocDelay = pktRecDelay / this.speed;
                this.setState({currentTsPost: parseInt(this.recTS)});
                /* If we're more than 5 ms early for this packet */
                if (pktLocDelay > 5) {
                    /* Call us again on time, later */
                    this.setTimeout(pktLocDelay);
                    return;
                }
            }

            /* Send packet ts to the top */
            this.props.onTsChange(this.pkt.pos);
            this.setState({currentTsPost: parseInt(this.pkt.pos)});

            /* Output the packet */
            if (this.pkt.is_io && !this.pkt.is_output) {
                this.sendInput(this.pkt);
            } else if (this.pkt.is_io) {
                this.state.term.write(this.pkt.io);
            } else {
                this.state.term.resize(this.pkt.width, this.pkt.height);
                if (!this.state.scale_lock) {
                    this._transform(this.pkt.width, this.pkt.height);
                }
            }

            /* We no longer have a packet */
            this.pkt = null;
        }
    }

    playPauseToggle() {
        this.setState({paused: !this.state.paused});
    }

    speedUp() {
        let speedExp = this.state.speedExp;
        if (speedExp < 4) {
            this.setState({speedExp: speedExp + 1});
        }
    }

    speedDown() {
        let speedExp = this.state.speedExp;
        if (speedExp > -4) {
            this.setState({speedExp: speedExp - 1});
        }
    }

    speedReset() {
        this.setState({speedExp: 0});
    }

    clearInputPlayer() {
        this.setState({input: ""});
    }

    rewindToStart() {
        this.clearInputPlayer();
        this.reset();
        this.sync();
    }

    fastForwardToEnd() {
        this.fastForwardTo = Infinity;
        this.sync();
    }

    fastForwardToTS(ts) {
        if (ts < this.recTS) {
            this.reset();
        }
        this.fastForwardTo = ts;
        this.sync();
    }

    skipFrame() {
        this.skip = true;
        this.sync();
    }

    handleKeyDown(event) {
        let keyCodesFuncs = {
            "p": this.playPauseToggle,
            "}": this.speedUp,
            "{": this.speedDown,
            "Backspace": this.speedReset,
            ".": this.skipFrame,
            "G": this.fastForwardToEnd,
            "R": this.rewindToStart,
            "+": this.zoomIn,
            "=": this.zoomIn,
            "-": this.zoomOut,
            "Z": this.fitIn,
        };
        if (keyCodesFuncs[event.key]) {
            (keyCodesFuncs[event.key](event));
        }
    }

    zoom(scale) {
        if (scale.toFixed(6) === this.state.scale_initial.toFixed(6)) {
            this.fitTo();
        } else {
            this.setState({
                term_top_style: "0",
                term_left_style: "0",
                term_translate: "0, 0",
                scale_lock: true,
                term_scroll: "auto",
                scale: scale,
                term_zoom_max: false,
                term_zoom_min: false,
            });
        }
    }

    dragPan() {
        (this.state.drag_pan ? this.dragPanDisable() : this.dragPanEnable());
    }

    dragPanEnable() {
        this.setState({drag_pan: true});

        let scrollwrap = this.refs.scrollwrap;

        let clicked = false;
        let clickX;
        let clickY;

        $(this.refs.scrollwrap).on({
            'mousemove': function(e) {
                clicked && updateScrollPos(e);
            },
            'mousedown': function(e) {
                clicked = true;
                clickY = e.pageY;
                clickX = e.pageX;
            },
            'mouseup': function() {
                clicked = false;
                $('html').css('cursor', 'auto');
            }
        });

        let updateScrollPos = function(e) {
            $('html').css('cursor', 'move');
            $(scrollwrap).scrollTop($(scrollwrap).scrollTop() + (clickY - e.pageY));
            $(scrollwrap).scrollLeft($(scrollwrap).scrollLeft() + (clickX - e.pageX));
        };
    }

    dragPanDisable() {
        this.setState({drag_pan: false});
        let scrollwrap = this.refs.scrollwrap;
        $(scrollwrap).off("mousemove");
        $(scrollwrap).off("mousedown");
        $(scrollwrap).off("mouseup");
    }

    zoomIn() {
        let scale = this.state.scale;
        if (scale < 2.1) {
            scale = scale + 0.1;
            this.zoom(scale);
        } else {
            this.setState({term_zoom_max: true});
        }
    }

    zoomOut() {
        let scale = this.state.scale;
        if (scale >= 0.2) {
            scale = scale - 0.1;
            this.zoom(scale);
        } else {
            this.setState({term_zoom_min: true});
        }
    }

    fitTo() {
        this.setState({
            term_top_style: "50%",
            term_left_style: "50%",
            term_translate: "-50%, -50%",
            scale_lock: false,
            term_scroll: "hidden",
        });
        this._transform();
    }

    componentWillMount() {
        let term = new Term({
            cols: this.state.cols,
            rows: this.state.rows,
            screenKeys: true,
            useStyle: true
        });

        term.on('title', this.handleTitleChange);

        this.setState({ term: term });

        window.addEventListener("keydown", this.handleKeyDown, false);
    }

    componentDidMount() {
        if (this.refs.wrapper.offsetWidth) {
            this.setState({containerWidth: this.refs.wrapper.offsetWidth});
        }
        /* Open the terminal */
        this.state.term.open(this.refs.term);
        window.setInterval(this.sync, 100);
        /* Reset playback */
        this.reset();
        this.fastForwardToTS(0);
    }

    componentWillUpdate(nextProps, nextState) {
        /* If we changed pause state or speed exponent */
        if (nextState.paused != this.state.paused ||
            nextState.speedExp != this.state.speedExp) {
            this.sync();
        }
    }

    componentDidUpdate(prevProps, prevState) {
        /* If we changed pause state or speed exponent */
        if (this.state.paused != prevState.paused ||
            this.state.speedExp != prevState.speedExp) {
            this.speed = Math.pow(2, this.state.speedExp);
            this.sync();
        }
        if (this.state.input != prevState.input) {
            scrollToBottom("input-textarea");
        }
        if (prevProps.logsTs != this.props.logsTs) {
            this.fastForwardToTS(this.props.logsTs);
        }
    }

    render() {
        let speedExp = this.state.speedExp;
        let speedFactor = Math.pow(2, Math.abs(speedExp));
        let speedStr;

        if (speedExp > 0) {
            speedStr = "x" + speedFactor;
        } else if (speedExp < 0) {
            speedStr = "/" + speedFactor;
        } else {
            speedStr = "";
        }

        const style = {
            "transform": "scale(" + this.state.scale + ") translate(" + this.state.term_translate + ")",
            "transformOrigin": "top left",
            "display": "inline-block",
            "margin": "0 auto",
            "position": "absolute",
            "top": this.state.term_top_style,
            "left": this.state.term_left_style,
        };

        const scrollwrap = {
            "minWidth": "630px",
            "height": this.containerHeight + "px",
            "backgroundColor": "#f5f5f5",
            "overflow": this.state.term_scroll,
            "position": "relative",
        };

        const to_right = {
            "float": "right",
        };

        const progressbar_style = {
            'marginTop': '10px',
        };

        const currentTsPost = function(currentTS, bufLength) {
            if (currentTS > bufLength) {
                return bufLength;
            }
            return currentTS;
        };

        let error = "";
        if (this.state.error) {
            error = (
                <div className="alert alert-danger alert-dismissable" >
                    <button type="button" className="close" data-dismiss="alert" aria-hidden="true">
                        <span className="pficon pficon-close" />
                    </button>
                    <span className="pficon pficon-error-circle-o" />
                    {this.state.error}.
                </div>);
        }

        // ensure react never reuses this div by keying it with the terminal widget
        return (
            <div id="recording-wrap">
                <div className="col-md-6 player-wrap">
                    <div ref="wrapper" className="panel panel-default">
                        <div className="panel-heading">
                            <span>{this.state.title}</span>
                        </div>
                        <div className="panel-body">
                            <div className={(this.state.drag_pan ? "dragnpan" : "")} style={scrollwrap} ref="scrollwrap">
                                <div ref="term" className="console-ct" key={this.state.term} style={style} />
                            </div>
                        </div>
                        <div className="panel-footer">
                            <button title="Play/Pause - Hotkey: p" type="button" ref="playbtn"
                                    className="btn btn-default btn-lg margin-right-btn play-btn"
                                    onClick={this.playPauseToggle}>
                                <i className={"fa fa-" + (this.state.paused ? "play" : "pause")}
                                   aria-hidden="true" />
                            </button>
                            <button title="Skip Frame - Hotkey: ." type="button"
                                    className="btn btn-default btn-lg margin-right-btn"
                                    onClick={this.skipFrame}>
                                <i className="fa fa-step-forward" aria-hidden="true" />
                            </button>
                            <button title="Restart Playback - Hotkey: Shift-R" type="button"
                                    className="btn btn-default btn-lg" onClick={this.rewindToStart}>
                                <i className="fa fa-fast-backward" aria-hidden="true" />
                            </button>
                            <button title="Fast-forward to end - Hotkey: Shift-G" type="button"
                                    className="btn btn-default btn-lg margin-right-btn"
                                    onClick={this.fastForwardToEnd}>
                                <i className="fa fa-fast-forward" aria-hidden="true" />
                            </button>
                            <button title="Speed /2 - Hotkey: {" type="button"
                                    className="btn btn-default btn-lg" onClick={this.speedDown}>
                                /2
                            </button>
                            <button title="Reset Speed - Hotkey: Backspace" type="button"
                                    className="btn btn-default btn-lg" onClick={this.speedReset}>
                                1:1
                            </button>
                            <button title="Speed x2 - Hotkey: }" type="button"
                                    className="btn btn-default btn-lg margin-right-btn"
                                    onClick={this.speedUp}>
                                x2
                            </button>
                            <span>{speedStr}</span>
                            <span style={to_right}>
                                <button title="Drag'n'Pan" type="button" className="btn btn-default btn-lg"
                                    onClick={this.dragPan}>
                                    <i className={"fa fa-" + (this.state.drag_pan ? "hand-rock-o" : "hand-paper-o")}
                                        aria-hidden="true" /></button>
                                <button title="Zoom In - Hotkey: =" type="button" className="btn btn-default btn-lg"
                                    onClick={this.zoomIn} disabled={this.state.term_zoom_max}>
                                    <i className="fa fa-search-plus" aria-hidden="true" /></button>
                                <button title="Fit To - Hotkey: Z" type="button" className="btn btn-default btn-lg"
                                    onClick={this.fitTo}><i className="fa fa-expand" aria-hidden="true" /></button>
                                <button title="Zoom Out - Hotkey: -" type="button" className="btn btn-default btn-lg"
                                    onClick={this.zoomOut} disabled={this.state.term_zoom_min}>
                                    <i className="fa fa-search-minus" aria-hidden="true" /></button>
                            </span>
                            <div style={progressbar_style}>
                                <ProgressBar length={this.buf.pos}
                                    mark={currentTsPost(this.state.currentTsPost, this.buf.pos)}
                                    fastForwardFunc={this.fastForwardToTS} />
                            </div>
                            <div id="input-player-wrap">
                                <InputPlayer input={this.state.input} />
                            </div>
                        </div>
                        {error}
                    </div>
                </div>
            </div>
        );
    }

    componentWillUnmount() {
        this.buf.stop();
        window.removeEventListener("keydown", this.handleKeyDown, false);
        this.state.term.destroy();
    }
}
