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

import React from "react";
import ReactDOM from "react-dom";

let $ = require("jquery");
let cockpit = require("cockpit");
let _ = cockpit.gettext;
let moment = require("moment");
let Journal = require("journal");
let Listing = require("cockpit-components-listing.jsx");
let Player = require("./player.jsx");

require("bootstrap-datetime-picker/js/bootstrap-datetimepicker.js");
require("bootstrap-datetime-picker/css/bootstrap-datetimepicker.css");

/*
 * Convert a number to integer number string and pad with zeroes to
 * specified width.
 */
let padInt = function (n, w) {
    let i = Math.floor(n);
    let a = Math.abs(i);
    let s = a.toString();
    for (w -= s.length; w > 0; w--) {
        s = '0' + s;
    }
    return ((i < 0) ? '-' : '') + s;
};

/*
 * Format date and time for a number of milliseconds since Epoch.
 */
let formatDateTime = function (ms) {
    return moment(ms).format("YYYY-MM-DD HH:mm:ss");
};

let formatDateTimeOffset = function (ms, offset) {
    return moment(ms).utcOffset(offset)
            .format("YYYY-MM-DD HH:mm:ss");
};

let formatUTC = function(date) {
    return moment(date).utc()
            .format("YYYY-MM-DD HH:mm:ss") + " UTC";
};

/*
 * Format a time interval from a number of milliseconds.
 */
let formatDuration = function (ms) {
    let v = Math.floor(ms / 1000);
    let s = Math.floor(v % 60);
    v = Math.floor(v / 60);
    let m = Math.floor(v % 60);
    v = Math.floor(v / 60);
    let h = Math.floor(v % 24);
    let d = Math.floor(v / 24);
    let str = '';

    if (d > 0) {
        str += d + ' ' + _("days") + ' ';
    }

    if (h > 0 || str.length > 0) {
        str += padInt(h, 2) + ':';
    }

    str += padInt(m, 2) + ':' + padInt(s, 2);

    return (ms < 0 ? '-' : '') + str;
};

let parseDate = function(date) {
    let regex = new RegExp(/^\s*(\d\d\d\d-\d\d-\d\d)(\s+(\d\d:\d\d(:\d\d)?))?\s*$/);

    let captures = regex.exec(date);

    if (captures != null) {
        let date = captures[1];
        if (captures[3]) {
            date = date + " " + captures[3];
        }
        if (moment(date, ["YYYY-M-D H:m:s", "YYYY-M-D H:m", "YYYY-M-D"], true).isValid()) {
            return date;
        }
    }

    if (date === "" || date === null) {
        return true;
    }

    return false;
};

/*
 * A component representing a date & time picker based on bootstrap-datetime-picker.
 * Requires jQuery, bootstrap-datetime-picker, moment.js
 * Properties:
 * - onChange: function to call on date change event of datepicker.
 * - value: variable to pass which will be used as initial value.
 */
class Datetimepicker extends React.Component {
    constructor(props) {
        super(props);
        this.handleDateChange = this.handleDateChange.bind(this);
        this.clearField = this.clearField.bind(this);
        this.state = {
            invalid: false,
            date: this.props.value,
        };
    }

    componentDidMount() {
        $(this.refs.datepicker).datetimepicker({
            format: 'yyyy-mm-dd hh:ii:00',
            autoclose: true,
            todayBtn: true,
        })
                .on('changeDate', this.handleDateChange);
        // remove datepicker from input, so it only works by button press
        $(this.refs.datepicker_input).datetimepicker('remove');
    }

    componentWillUnmount() {
        $(this.refs.datepicker).datetimepicker('remove');
    }

    handleDateChange() {
        const date = $(this.refs.datepicker_input).val()
                .trim();
        this.setState({invalid: false, date: date});
        if (!parseDate(date)) {
            this.setState({invalid: true});
        } else {
            this.props.onChange(date);
        }
    }

    clearField() {
        const date = "";
        this.props.onChange(date);
        this.setState({date: date, invalid: false});
        $(this.refs.datepicker_input).val("");
    }

    render() {
        return (
            <div ref="datepicker" className="input-group date input-append date form_datetime">
                <input ref="datepicker_input" type="text" size="16"
                    className={"form-control bootstrap-datepicker " + (this.state.invalid ? "invalid" : "valid")}
                    value={this.state.date} onChange={this.handleDateChange} />
                <span className="input-group-addon add-on"><i className="fa fa-calendar" /></span>
                <span className="input-group-addon add-on" onClick={this.clearField}>
                    <i className="fa fa-remove" /></span>
            </div>
        );
    }
}

function LogElement(props) {
    const entry = props.entry;
    const start = props.start;
    const end = props.end;
    const cursor = entry.__CURSOR;
    const entry_timestamp = parseInt(entry.__REALTIME_TIMESTAMP / 1000);

    const timeClick = function(e) {
        const ts = entry_timestamp - start;
        if (ts > 0) {
            props.jumpToTs(ts);
        } else {
            props.jumpToTs(0);
        }
    };
    const messageClick = () => {
        const url = '/system/logs#/' + cursor + '?parent_options={}';
        const win = window.open(url, '_blank');
        win.focus();
    };

    let className = 'cockpit-logline';
    if (start < entry_timestamp && end > entry_timestamp) {
        className = 'cockpit-logline highlighted';
    }

    return (
        <div className={className} data-cursor={cursor} key={cursor}>
            <div className="cockpit-log-warning">
                <i className="fa fa-exclamation-triangle" />
            </div>
            <div className="logs-view-log-time" onClick={timeClick}>{formatDateTime(entry_timestamp)}</div>
            <span className="cockpit-log-message" onClick={messageClick}>{entry.MESSAGE}</span>
        </div>
    );
}

function LogsView(props) {
    const entries = props.entries;
    const start = props.start;
    const end = props.end;
    const rows = entries.map((entry) =>
        <LogElement key={entry.__CURSOR} entry={entry} start={start} end={end} jumpToTs={props.jumpToTs} />
    );
    return (
        <div className="panel panel-default cockpit-log-panel" id="logs-view">
            {rows}
        </div>
    );
}

class Logs extends React.Component {
    constructor(props) {
        super(props);
        this.journalctlError = this.journalctlError.bind(this);
        this.journalctlIngest = this.journalctlIngest.bind(this);
        this.journalctlPrepend = this.journalctlPrepend.bind(this);
        this.getLogs = this.getLogs.bind(this);
        this.loadLater = this.loadLater.bind(this);
        this.loadForTs = this.loadForTs.bind(this);
        this.getServerTimeOffset = this.getServerTimeOffset.bind(this);
        this.journalCtl = null;
        this.entries = [];
        this.start = null;
        this.end = null;
        this.hostname = null;
        this.state = {
            serverTimeOffset: null,
            cursor: null,
            after: null,
            entries: [],
        };
    }

    getServerTimeOffset() {
        cockpit.spawn(["date", "+%s:%:z"], { err: "message" })
                .done((data) => {
                    this.setState({serverTimeOffset: data.slice(data.indexOf(":") + 1)});
                })
                .fail((ex) => {
                    console.log("Couldn't calculate server time offset: " + cockpit.message(ex));
                });
    }

    scrollToTop() {
        const logs_view = document.getElementById("logs-view");
        logs_view.scrollTop = 0;
    }

    scrollToBottom() {
        const logs_view = document.getElementById("logs-view");
        logs_view.scrollTop = logs_view.scrollHeight;
    }

    journalctlError(error) {
        console.warn(cockpit.message(error));
    }

    journalctlIngest(entryList) {
        if (entryList.length > 0) {
            this.entries.push(...entryList);
            const after = this.entries[this.entries.length - 1].__CURSOR;
            this.setState({entries: this.entries, after: after});
            this.scrollToBottom();
        }
    }

    journalctlPrepend(entryList) {
        entryList.push(...this.entries);
        this.setState({entries: this.entries});
    }

    getLogs() {
        if (this.start != null && this.end != null) {
            if (this.journalCtl != null) {
                this.journalCtl.stop();
                this.journalCtl = null;
            }

            let matches = [];
            if (this.hostname) {
                matches.push("_HOSTNAME=" + this.hostname);
            }

            let start = null;
            let end = null;

            if (this.state.serverTimeOffset != null) {
                start = formatDateTimeOffset(this.start, this.state.serverTimeOffset);
                end = formatDateTimeOffset(this.end, this.state.serverTimeOffset);
            } else {
                start = formatDateTime(this.start);
                end = formatDateTime(this.end);
            }

            let options = {
                since: start,
                until: end,
                follow: false,
                count: "all",
                merge: true,
            };

            if (this.state.after != null) {
                options["after"] = this.state.after;
                delete options.since;
            }

            const self = this;
            this.journalCtl = Journal.journalctl(matches, options)
                    .fail(this.journalctlError)
                    .done(function(data) {
                        self.journalctlIngest(data);
                    });
        }
    }

    loadLater() {
        this.start = this.end;
        this.end = this.end + 3600;
        this.getLogs();
    }

    loadForTs(ts) {
        this.end = this.start + ts;
        this.getLogs();
    }

    componentDidMount() {
        this.getServerTimeOffset();
    }

    componentDidUpdate() {
        if (this.props.recording) {
            if (this.start === null && this.end === null) {
                this.end = this.props.recording.start + 3600;
                this.start = this.props.recording.start;
            }
            if (this.props.recording.hostname) {
                this.hostname = this.props.recording.hostname;
            }
            this.getLogs();
        }
        if (this.props.curTs) {
            const ts = this.props.curTs;
            this.loadForTs(ts);
        }
    }

    componentWillUnmount() {
        this.journalCtl.stop();
        this.setState({
            serverTimeOffset: null,
            cursor: null,
            after: null,
            entries: [],
        });
    }

    render() {
        let r = this.props.recording;
        if (r == null) {
            return <span>Loading...</span>;
        } else {
            return (
                <div className="panel panel-default">
                    <div className="panel-heading">
                        <span>{_("Logs")}</span>
                        <button className="btn btn-default" style={{"float":"right"}} onClick={this.loadLater}>{_("Load later entries")}</button>
                    </div>
                    <LogsView entries={this.state.entries} start={this.props.recording.start}
                              end={this.props.recording.end} jumpToTs={this.props.jumpToTs} />
                    <div className="panel-heading" />
                </div>
            );
        }
    }
}

/*
 * A component representing a single recording view.
 * Properties:
 * - recording: either null for no recording data available yet, or a
 *              recording object, as created by the View below.
 */
class Recording extends React.Component {
    constructor(props) {
        super(props);
        this.goBackToList = this.goBackToList.bind(this);
        this.handleTsChange = this.handleTsChange.bind(this);
        this.handleLogTsChange = this.handleLogTsChange.bind(this);
        this.handleLogsClick = this.handleLogsClick.bind(this);
        this.handleLogsReset = this.handleLogsReset.bind(this);
        this.state = {
            curTs: null,
            logsTs: null,
            logsEnabled: false,
        };
    }

    handleTsChange(ts) {
        this.setState({curTs: ts});
    }

    handleLogTsChange(ts) {
        this.setState({logsTs: ts});
    }

    handleLogsClick() {
        this.setState({logsEnabled: !this.state.logsEnabled});
    }

    handleLogsReset() {
        this.setState({logsEnabled: false}, () => {
            this.setState({logsEnabled: true});
        });
    }

    goBackToList() {
        if (cockpit.location.path[0]) {
            if ("search_rec" in cockpit.location.options) {
                delete cockpit.location.options.search_rec;
            }
            cockpit.location.go([], cockpit.location.options);
        } else {
            cockpit.location.go('/');
        }
    }

    render() {
        let r = this.props.recording;
        if (r == null) {
            return <span>Loading...</span>;
        } else {
            let player =
                (<Player.Player
                    ref="player"
                    matchList={this.props.recording.matchList}
                    logsTs={this.logsTs}
                    search={this.props.search}
                    onTsChange={this.handleTsChange}
                    recording={r}
                    logsEnabled={this.state.logsEnabled}
                    onRewindStart={this.handleLogsReset} />);

            return (
                <React.Fragment>
                    <div className="container-fluid">
                        <div className="row">
                            <div className="col-md-12">
                                <ol className="breadcrumb">
                                    <li><a onClick={this.goBackToList}>{_("Session Recording")}</a></li>
                                    <li className="active">{_("Session")}</li>
                                </ol>
                            </div>
                            {player}
                        </div>
                        <div className="row">
                            <div className="col-md-12">
                                <button className="btn btn-default" style={{"float":"left"}} onClick={this.handleLogsClick}>{_("Logs View")}</button>
                            </div>
                        </div>
                        {this.state.logsEnabled === true &&
                        <div className="row">
                            <div className="col-md-12">
                                <Logs recording={this.props.recording} curTs={this.state.curTs} jumpToTs={this.handleLogTsChange} />
                            </div>
                        </div>
                        }
                    </div>
                </React.Fragment>
            );
        }
    }
}

/*
 * A component representing a list of recordings.
 * Properties:
 * - list: an array with recording objects, as created by the View below
 */
class RecordingList extends React.Component {
    constructor(props) {
        super(props);
        this.handleColumnClick = this.handleColumnClick.bind(this);
        this.getSortedList = this.getSortedList.bind(this);
        this.drawSortDir = this.drawSortDir.bind(this);
        this.getColumnTitles = this.getColumnTitles.bind(this);
        this.getColumns = this.getColumns.bind(this);
        this.state = {
            sorting_field: "start",
            sorting_asc: true,
        };
    }

    drawSortDir() {
        $('#sort_arrow').remove();
        let type = this.state.sorting_asc ? "asc" : "desc";
        let arrow = '<i id="sort_arrow" class="fa fa-sort-' + type + '" aria-hidden="true" />';
        $(this.refs[this.state.sorting_field]).append(arrow);
    }

    handleColumnClick(event) {
        if (this.state.sorting_field === event.currentTarget.id) {
            this.setState({sorting_asc: !this.state.sorting_asc});
        } else {
            this.setState({
                sorting_field: event.currentTarget.id,
                sorting_asc: true,
            });
        }
    }

    getSortedList() {
        let field = this.state.sorting_field;
        let asc = this.state.sorting_asc;
        let list = this.props.list.slice();
        let isNumeric;

        if (field === "start" || field === "end" || field === "duration") {
            isNumeric = true;
        }

        if (isNumeric) {
            list.sort((a, b) => a[field] - b[field]);
        } else {
            list.sort((a, b) => (a[field] > b[field]) ? 1 : -1);
        }

        if (!asc) {
            list.reverse();
        }

        return list;
    }

    /*
     * Set the cockpit location to point to the specified recording.
     */
    navigateToRecording(recording) {
        cockpit.location.go([recording.id], cockpit.location.options);
    }

    componentDidUpdate() {
        this.drawSortDir();
    }

    getColumnTitles() {
        let columnTitles = [
            (<div id="user" className="sort" onClick={this.handleColumnClick}><span>{_("User")}</span> <div
                ref="user" className="sort-icon" /></div>),
            (<div id="start" className="sort" onClick={this.handleColumnClick}><span>{_("Start")}</span> <div
                ref="start" className="sort-icon" /></div>),
            (<div id="end" className="sort" onClick={this.handleColumnClick}><span>{_("End")}</span> <div
                ref="end" className="sort-icon" /></div>),
            (<div id="duration" className="sort" onClick={this.handleColumnClick}><span>{_("Duration")}</span> <div
                ref="duration" className="sort-icon" /></div>),
        ];
        if (this.props.diff_hosts === true) {
            columnTitles.push((<div id="hostname" className="sort" onClick={this.handleColumnClick}>
                <span>{_("Hostname")}</span> <div ref="hostname" className="sort-icon" /></div>));
        }
        return columnTitles;
    }

    getColumns(r) {
        let columns = [r.user,
            formatDateTime(r.start),
            formatDateTime(r.end),
            formatDuration(r.end - r.start)];
        if (this.props.diff_hosts === true) {
            columns.push(r.hostname);
        }
        return columns;
    }

    render() {
        let columnTitles = this.getColumnTitles();
        let list = this.getSortedList();
        let rows = [];

        for (let i = 0; i < list.length; i++) {
            let r = list[i];
            let columns = this.getColumns(r);
            rows.push(<Listing.ListingRow
                        key={r.id}
                        rowId={r.id}
                        columns={columns}
                        navigateToItem={this.navigateToRecording.bind(this, r)} />);
        }
        return (
            <Listing.Listing title={_("Sessions")}
                             columnTitles={columnTitles}
                             emptyCaption={_("No recorded sessions")}
                             fullWidth={false}>
                {rows}
            </Listing.Listing>
        );
    }
}

/*
 * A component representing the view upon a list of recordings, or a
 * single recording. Extracts the ID of the recording to display from
 * cockpit.location.path[0]. If it's zero, displays the list.
 */
class View extends React.Component {
    constructor(props) {
        super(props);
        this.onLocationChanged = this.onLocationChanged.bind(this);
        this.journalctlIngest = this.journalctlIngest.bind(this);
        this.handleInputChange = this.handleInputChange.bind(this);
        this.handleDateSinceChange = this.handleDateSinceChange.bind(this);
        this.openConfig = this.openConfig.bind(this);
        /* Journalctl instance */
        this.journalctl = null;
        /* Recording ID journalctl instance is invoked with */
        this.journalctlRecordingID = null;
        /* Recording ID -> data map */
        this.recordingMap = {};
        /* tlog UID in system set in ComponentDidMount */
        this.uid = null;
        this.state = {
            /* List of recordings in start order */
            recordingList: [],
            /* ID of the recording to display, or null for all */
            recordingID: cockpit.location.path[0] || null,
            /* filter values start */
            date_since: cockpit.location.options.date_since || "",
            date_until: cockpit.location.options.date_until || "",
            username: cockpit.location.options.username || "",
            hostname: cockpit.location.options.hostname || "",
            search: cockpit.location.options.search || "",
            /* filter values end */
            error_tlog_uid: false,
            diff_hosts: false,
        };
    }

    /*
     * Display a journalctl error
     */
    journalctlError(error) {
        console.warn(cockpit.message(error));
    }

    /*
     * Respond to cockpit location change by extracting and setting the
     * displayed recording ID.
     */
    onLocationChanged() {
        this.setState({
            recordingID: cockpit.location.path[0] || null,
            date_since: cockpit.location.options.date_since || "",
            date_until: cockpit.location.options.date_until || "",
            username: cockpit.location.options.username || "",
            hostname: cockpit.location.options.hostname || "",
            search: cockpit.location.options.search || "",
        });
    }

    /*
     * Ingest journal entries sent by journalctl.
     */
    journalctlIngest(entryList) {
        let recordingList = this.state.recordingList.slice();
        let i;
        let j;
        let hostname;

        if (entryList[0]) {
            if (entryList[0]["_HOSTNAME"]) {
                hostname = entryList[0]["_HOSTNAME"];
            }
        }

        for (i = 0; i < entryList.length; i++) {
            let e = entryList[i];
            let id = e['TLOG_REC'];

            /* Skip entries with missing recording ID */
            if (id === undefined) {
                continue;
            }

            let ts = Math.floor(
                parseInt(e["__REALTIME_TIMESTAMP"], 10) /
                            1000);

            let r = this.recordingMap[id];
            /* If no recording found */
            if (r === undefined) {
                /* Create new recording */
                if (hostname !== e["_HOSTNAME"]) {
                    this.setState({diff_hosts: true});
                }

                r = {id:            id,
                     matchList:     ["TLOG_REC=" + id],
                     user:          e["TLOG_USER"],
                     boot_id:       e["_BOOT_ID"],
                     session_id:    parseInt(e["TLOG_SESSION"], 10),
                     pid:           parseInt(e["_PID"], 10),
                     start:         ts,
                     /* FIXME Should be start + message duration */
                     end:       ts,
                     hostname:  e["_HOSTNAME"],
                     duration:  0};
                /* Map the recording */
                this.recordingMap[id] = r;
                /* Insert the recording in order */
                for (j = recordingList.length - 1;
                    j >= 0 && r.start < recordingList[j].start;
                    j--);
                recordingList.splice(j + 1, 0, r);
            } else {
                /* Adjust existing recording */
                if (ts > r.end) {
                    r.end = ts;
                    r.duration = r.end - r.start;
                }
                if (ts < r.start) {
                    r.start = ts;
                    r.duration = r.end - r.start;
                    /* Find the recording in the list */
                    for (j = recordingList.length - 1;
                        j >= 0 && recordingList[j] != r;
                        j--);
                    /* If found */
                    if (j >= 0) {
                        /* Remove */
                        recordingList.splice(j, 1);
                    }
                    /* Insert the recording in order */
                    for (j = recordingList.length - 1;
                        j >= 0 && r.start < recordingList[j].start;
                        j--);
                    recordingList.splice(j + 1, 0, r);
                }
            }
        }

        this.setState({recordingList: recordingList});
    }

    /*
     * Start journalctl, retrieving entries for the current recording ID.
     * Assumes journalctl is not running.
     */
    journalctlStart() {
        let matches = ["_COMM=tlog-rec",
            /* Strings longer than TASK_COMM_LEN (16) characters
             * are truncated (man proc) */
            "_COMM=tlog-rec-sessio"];

        if (this.state.username && this.state.username !== "") {
            matches.push("TLOG_USER=" + this.state.username);
        }
        if (this.state.hostname && this.state.hostname !== "") {
            matches.push("_HOSTNAME=" + this.state.hostname);
        }

        let options = {follow: false, count: "all", merge: true};

        if (this.state.date_since && this.state.date_since !== "") {
            options['since'] = formatUTC(this.state.date_since);
        }

        if (this.state.date_until && this.state.date_until !== "") {
            options['until'] = formatUTC(this.state.date_until);
        }

        if (this.state.search && this.state.search !== "" && this.state.recordingID === null) {
            options["grep"] = this.state.search;
        }

        if (this.state.recordingID !== null) {
            delete options["grep"];
            matches.push("TLOG_REC=" + this.state.recordingID);
        }

        this.journalctlRecordingID = this.state.recordingID;
        this.journalctl = Journal.journalctl(matches, options)
                .fail(this.journalctlError)
                .stream(this.journalctlIngest);
    }

    /*
     * Check if journalctl is running.
     */
    journalctlIsRunning() {
        return this.journalctl != null;
    }

    /*
     * Stop current journalctl.
     * Assumes journalctl is running.
     */
    journalctlStop() {
        this.journalctl.stop();
        this.journalctl = null;
    }

    /*
     * Restarts journalctl.
     * Will stop journalctl if it's running.
     */
    journalctlRestart() {
        if (this.journalctlIsRunning()) {
            this.journalctl.stop();
        }
        this.journalctlStart();
    }

    /*
     * Clears previous recordings list.
     * Will clear service obj recordingMap and state.
     */
    clearRecordings() {
        this.recordingMap = {};
        this.setState({recordingList: []});
    }

    handleInputChange(event) {
        const name = event.target.name;
        const value = event.target.value;
        let state = {};
        state[name] = value;
        this.setState(state);
        cockpit.location.go([], $.extend(cockpit.location.options, state));
    }

    handleDateSinceChange(date) {
        cockpit.location.go([], $.extend(cockpit.location.options, {date_since: date}));
    }

    handleDateUntilChange(date) {
        cockpit.location.go([], $.extend(cockpit.location.options, {date_until: date}));
    }

    openConfig() {
        cockpit.jump(['session-recording/config']);
    }

    componentDidMount() {
        let proc = cockpit.spawn(["getent", "passwd", "tlog"]);

        proc.stream((data) => {
            this.uid = data.split(":", 3)[2];
            this.journalctlStart();
            proc.close();
        });

        proc.fail(() => {
            this.setState({error_tlog_uid: true});
        });

        cockpit.addEventListener("locationchanged",
                                 this.onLocationChanged);
    }

    componentWillUnmount() {
        if (this.journalctlIsRunning()) {
            this.journalctlStop();
        }
    }

    componentDidUpdate(prevProps, prevState) {
        /*
         * If we're running a specific (non-wildcard) journalctl
         * and recording ID has changed
         */
        if (this.journalctlRecordingID !== null &&
            this.state.recordingID !== prevState.recordingID) {
            if (this.journalctlIsRunning()) {
                this.journalctlStop();
            }
            this.journalctlStart();
        }
        if (this.state.date_since !== prevState.date_since ||
            this.state.date_until !== prevState.date_until ||
            this.state.username !== prevState.username ||
            this.state.hostname !== prevState.hostname ||
            this.state.search !== prevState.search
        ) {
            this.clearRecordings();
            this.journalctlRestart();
        }
    }

    render() {
        if (this.state.error_tlog_uid === true) {
            return (
                <div className="container-fluid">
                    Error getting tlog UID from system.
                </div>
            );
        }
        if (this.state.recordingID === null) {
            return (
                <React.Fragment>
                    <div className="content-header-extra">
                        <table className="form-table-ct">
                            <thead>
                                <tr>
                                    <td className="top">
                                        <label className="control-label" htmlFor="date_since">{_("Since")}</label>
                                    </td>
                                    <td>
                                        <Datetimepicker value={this.state.date_since} onChange={this.handleDateSinceChange} />
                                    </td>
                                    <td className="top">
                                        <label className="control-label" htmlFor="date_until">{_("Until")}</label>
                                    </td>
                                    <td>
                                        <Datetimepicker value={this.state.date_until} onChange={this.handleDateUntilChange} />
                                    </td>
                                </tr>
                                <tr>
                                    <td className="top">
                                        <label className="control-label" htmlFor="search">Search</label>
                                    </td>
                                    <td>
                                        <div className="input-group">
                                            <input type="text" className="form-control" name="search" value={this.state.search}
                                                   onChange={this.handleInputChange} />
                                        </div>
                                    </td>
                                    <td className="top">
                                        <label className="control-label" htmlFor="username">Username</label>
                                    </td>
                                    <td>
                                        <div className="input-group">
                                            <input type="text" className="form-control" name="username" value={this.state.username}
                                                   onChange={this.handleInputChange} />
                                        </div>
                                    </td>
                                    {this.state.diff_hosts === true &&
                                    <td className="top">
                                        <label className="control-label" htmlFor="hostname">{_("Hostname")}</label>
                                    </td>
                                    }
                                    {this.state.diff_hosts === true &&
                                    <td>
                                        <div className="input-group">
                                            <input type="text" className="form-control" name="hostname" value={this.state.hostname}
                                                   onChange={this.handleInputChange} />
                                        </div>
                                    </td>
                                    }
                                    <td className="top">
                                        <label className="control-label" htmlFor="config">{_("Configuration")}</label>
                                    </td>
                                    <td className="top">
                                        <button className="btn btn-default" onClick={this.openConfig}><i className="fa fa-cog" aria-hidden="true" /></button>
                                    </td>
                                </tr>
                            </thead>
                        </table>
                    </div>
                    <RecordingList
                        date_since={this.state.date_since}
                        date_until={this.state.date_until}
                        username={this.state.username}
                        hostname={this.state.hostname}
                        list={this.state.recordingList}
                        diff_hosts={this.state.diff_hosts} />
                </React.Fragment>
            );
        } else {
            return (
                <React.Fragment>
                    <Recording recording={this.recordingMap[this.state.recordingID]} search={this.state.search} />
                </React.Fragment>
            );
        }
    }
}

ReactDOM.render(<View />, document.getElementById('view'));
