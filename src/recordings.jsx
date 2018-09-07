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

(function() {
    "use strict";

    let $ = require("jquery");
    let cockpit = require("cockpit");
    let _ = cockpit.gettext;
    let moment = require("moment");
    let Journal = require("journal");
    let React = require("react");
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
    }

    /*
     * Format date and time for a number of milliseconds since Epoch.
     */
    let formatDateTime = function (ms) {
        let d = new Date(ms);
        return (
            padInt(d.getFullYear(), 4) + '-' +
            padInt(d.getMonth() + 1, 2) + '-' +
            padInt(d.getDate(), 2) + ' ' +
            padInt(d.getHours(), 2) + ':' +
            padInt(d.getMinutes(), 2) + ':' +
            padInt(d.getSeconds(), 2)
        );
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
    }

    /*
     * A component representing a date & time picker based on bootstrap-datetime-picker.
     * Requires jQuery, bootstrap-datetime-picker, moment.js
     * Properties:
     * - onDateChange: function to call on date change event of datepicker.
     * - date: variable to pass which will be used as initial value.
     */
    let Datetimepicker = class extends React.Component {
        constructor(props) {
            super(props);
            this.handleDateChange = this.handleDateChange.bind(this);
            this.clearField = this.clearField.bind(this);
            this.markDateField = this.markDateField.bind(this);
            this.state = {
                invalid: false,
                date: this.props.date,
                dateLastValid: null,
            };
        }

        componentDidMount() {
            let funcDate = this.handleDateChange;
            let datepicker = $(this.refs.datepicker).datetimepicker({
                format: 'yyyy-mm-dd hh:ii:00',
                autoclose: true,
                todayBtn: true,
            });
            datepicker.on('changeDate', function(e) {
                funcDate(e);
            });
            $(this.refs.datepicker_input).datetimepicker('remove');
            this.markDateField();
        }

        componentWillUnmount() {
            $(this.textInput).datetimepicker('remove');
        }

        handleDateChange(e) {
            if (e.type === "changeDate") {
                let event = new Event('input', { bubbles: true });
                e.currentTarget.firstChild.dispatchEvent(event);
            }

            if (e.type === "input") {
                this.setState({date: e.target.value});
                if (parseDate(e.target.value)) {
                    this.setState({dateLastValid: e.target.value});
                    this.setState({invalid: false});
                    this.props.onDateChange(e.target.value, e.target.value.trim());
                } else {
                    this.setState({invalid: true});
                    this.props.onDateChange(e.target.value, this.state.dateLastValid.trim());
                }
            }
        }

        clearField() {
            $(this.refs.datepicker_input).val("");
            let event = new Event('input', { bubbles: true });
            this.refs.datepicker_input.dispatchEvent(event);
            this.handleDateChange(event);
            this.setState({invalid: false});
        }

        markDateField() {
            let date = $(this.refs.datepicker_input).val()
                    .trim();
            if (!parseDate(date)) {
                this.setState({invalid: true});
            } else {
                this.setState({dateLastValid: date});
                this.setState({invalid: false});
            }
        }

        render() {
            return (
                <div ref="datepicker" className="input-group date input-append date form_datetime">
                    <input ref="datepicker_input" type="text" size="16"
                        className={"form-control bootstrap-datepicker " + (this.state.invalid ? "invalid" : "valid")}
                        readOnly value={this.state.date} onChange={this.handleDateChange} />
                    <span className="input-group-addon add-on"><i className="fa fa-calendar" /></span>
                    <span className="input-group-addon add-on" onClick={this.clearField}>
                        <i className="fa fa-remove" /></span>
                </div>
            );
        }
    }

    /*
     * A component representing a username input text field.
     * TODO make as a select / drop-down with list of exisiting users.
    */
    let UserPicker = class extends React.Component {
        constructor(props) {
            super(props);
            this.handleUsernameChange = this.handleUsernameChange.bind(this);
        }

        handleUsernameChange(e) {
            this.props.onUsernameChange(e.target.value);
        }

        render() {
            return (
                <div className="input-group">
                    <input type="text" className="form-control" value={this.props.username}
                        onChange={this.handleUsernameChange} />
                </div>
            );
        }
    }

    let HostnamePicker = class extends React.Component {
        constructor(props) {
            super(props);
            this.handleHostnameChange = this.handleHostnameChange.bind(this);
        }

        handleHostnameChange(e) {
            this.props.onHostnameChange(e.target.value);
        }

        render() {
            return (
                <div className="input-group">
                    <input type="text" className="form-control" value={this.props.hostname}
                           onChange={this.handleHostnameChange} />
                </div>
            );
        }
    }

    function LogElement(props) {
        const entry = props.entry;
        const start = props.start;
        const end = props.end;
        const entry_timestamp = entry.__REALTIME_TIMESTAMP / 1000;
        let className = 'cockpit-logline';
        if (start < entry_timestamp && end > entry_timestamp) {
            className = 'cockpit-logline highlighted';
        }
        return (
            <div className={className} data-cursor={entry.__CURSOR}>
                <div className="cockpit-log-warning">
                    <i className="fa fa-exclamation-triangle" />
                </div>
                <div className="logs-view-log-time">{formatDateTime(parseInt(entry.__REALTIME_TIMESTAMP / 1000))}</div>
                <span className="cockpit-log-message">{entry.MESSAGE}</span>
            </div>
        );
    }

    function LogsView(props) {
        const entries = props.entries;
        const start = props.start;
        const end = props.end;
        const rows = entries.map((entry) =>
            <LogElement entry={entry} start={start} end={end} />
        );
        return (
            <div className="panel panel-default cockpit-log-panel" id="logs-view">
                {rows}
            </div>
        );
    }

    let Logs = class extends React.Component {
        constructor(props) {
            super(props);
            this.journalctlError = this.journalctlError.bind(this);
            this.journalctlIngest = this.journalctlIngest.bind(this);
            this.journalctlPrepend = this.journalctlPrepend.bind(this);
            this.getLogs = this.getLogs.bind(this);
            this.loadLater = this.loadLater.bind(this);
            this.loadEarlier = this.loadEarlier.bind(this);
            this.loadForTs = this.loadForTs.bind(this);
            this.journalCtl = null;
            this.entries = [];
            this.start = null;
            this.end = null;
            this.earlier_than = null;
            this.load_earlier = false;
            this.state = {
                cursor: null,
                after: null,
                entries: [],
            };
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
            if (this.load_earlier === true) {
                entryList.push(...this.entries);
                this.entries = entryList;
                this.setState({entries: this.entries});
                this.load_earlier = false;
                this.scrollToTop();
            } else {
                if (entryList.length > 0) {
                    this.entries.push(...entryList);
                    const after = this.entries[this.entries.length - 1].__CURSOR;
                    this.setState({entries: this.entries, after: after});
                    this.scrollToBottom();
                }
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

                let options = {
                    since: formatDateTime(this.start),
                    until: formatDateTime(this.end),
                    follow: false,
                    count: "all",
                };

                if (this.load_earlier === true) {
                    options["until"] = formatDateTime(this.earlier_than);
                } else if (this.state.after != null) {
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

        loadEarlier() {
            this.load_earlier = true;
            this.start = this.start - 3600;
            this.getLogs();
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

        componentDidUpdate() {
            if (this.props.recording) {
                if (this.start === null && this.end === null) {
                    this.end = this.props.recording.start + 3600;
                    this.start = this.props.recording.start;
                    this.earlier_than = this.props.recording.start;
                }
                this.getLogs();
            }
            if (this.props.curTs) {
                const ts = this.props.curTs;
                this.loadForTs(ts);
            }
        }

        render() {
            if (this.props.recording) {
                return (
                    <div className="panel panel-default">
                        <div className="panel-heading">
                            <span>Logs</span>
                            <button className="btn btn-default" style={{"float":"right"}} onClick={this.loadEarlier}>Load earlier entries</button>
                        </div>
                        <LogsView entries={this.state.entries} start={this.props.recording.start}
                                  end={this.props.recording.end} />
                        <div className="panel-heading">
                            <button className="btn btn-default" onClick={this.loadLater}>Load later entries</button>
                        </div>
                    </div>
                );
            } else {
                return (<div>Loading...</div>);
            }
        }
    }

    /*
     * A component representing a single recording view.
     * Properties:
     * - recording: either null for no recording data available yet, or a
     *              recording object, as created by the View below.
     */
    let Recording = class extends React.Component {
        constructor(props) {
            super(props);
            this.goBackToList = this.goBackToList.bind(this);
            this.getHostname = this.getHostname.bind(this);
            this.Hostname = this.Hostname.bind(this);
            this.hostname = null;
        }

        goBackToList() {
            if (cockpit.location.path[0]) {
                cockpit.location.go([], cockpit.location.options);
            } else {
                cockpit.location.go('/');
            }
        }

        getHostname() {
            cockpit.spawn(["hostname"], { err: "ignore" })
                .done(function(output) {
                    this.hostname = $.trim(output);
                })
                .fail(function(ex) {
                    console.log(ex);
                });
        }

        Hostname(props) {
            let style = {
                display: "none"
            };
            if (this.hostname != null && this.hostname != props.hostname) {
                style = {};
            }
            return (
                <tr style={style}>
                    <td>{_("Hostname")}</td>
                    <td>{props.hostname}</td>
                </tr>
            );
        }

        componentWillMount() {
            this.getHostname();
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
                        onTsChange={this.props.onTsChange} />);

                return (
                    <div className="container-fluid">
                        <div className="row">
                            <div className="col-md-12">
                                <ol className="breadcrumb">
                                    <li><a onClick={this.goBackToList}>Session Recording</a></li>
                                    <li className="active">Session</li>
                                </ol>
                            </div>
                        </div>
                        <div className="row">
                            <div className="col-md-3">
                                <div className="panel panel-default">
                                    <div className="panel-heading">
                                        <span>{_("Recording")}</span>
                                    </div>
                                    <div className="panel-body">
                                        <table className="form-table-ct">
                                            <tr>
                                                <td>{_("ID")}</td>
                                                <td>{r.id}</td>
                                            </tr>
                                            <this.Hostname hostname={r.hostname} />
                                            <tr>
                                                <td>{_("Boot ID")}</td>
                                                <td>{r.boot_id}</td>
                                            </tr>
                                            <tr>
                                                <td>{_("Session ID")}</td>
                                                <td>{r.session_id}</td>
                                            </tr>
                                            <tr>
                                                <td>{_("PID")}</td>
                                                <td>{r.pid}</td>
                                            </tr>
                                            <tr>
                                                <td>{_("Start")}</td>
                                                <td>{formatDateTime(r.start)}</td>
                                            </tr>
                                            <tr>
                                                <td>{_("End")}</td>
                                                <td>{formatDateTime(r.end)}</td>
                                            </tr>
                                            <tr>
                                                <td>{_("Duration")}</td>
                                                <td>{formatDuration(r.end - r.start)}</td>
                                            </tr>
                                            <tr>
                                                <td>{_("User")}</td>
                                                <td>{r.user}</td>
                                            </tr>
                                        </table>
                                    </div>
                                </div>
                            </div>
                            {player}
                        </div>
                    </div>
                );
            }
        }
    };

    /*
     * A component representing a list of recordings.
     * Properties:
     * - list: an array with recording objects, as created by the View below
     */
    let RecordingList = class extends React.Component {
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
            let arrow = '<i id="sort_arrow" class="fa fa-sort-' + type + '" aria-hidden="true"></i>';
            $(this.refs[this.state.sorting_field]).append(arrow);
        }

        handleColumnClick(event) {
            if (this.state.sorting_field === event.currentTarget.id) {
                this.setState({sorting_asc: !this.state.sorting_asc});
            } else {
                this.setState({
                    sorting_field: event.currentTarget.id,
                    sorting_asc: 'asc'
                });
            }
        }

        getSortedList() {
            let field = this.state.sorting_field;
            let asc = this.state.sorting_asc;
            let list = this.props.list.slice();

            if (this.state.sorting_field != null) {
                if (asc) {
                    list.sort(function(a, b) {
                        return a[field] > b[field];
                    });
                } else {
                    list.sort(function(a, b) {
                        return a[field] < b[field];
                    });
                }
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
                    ref="user" className="sort-icon"></div></div>),
                (<div id="start" className="sort" onClick={this.handleColumnClick}><span>{_("Start")}</span> <div
                    ref="start" className="sort-icon"></div></div>),
                (<div id="end" className="sort" onClick={this.handleColumnClick}><span>{_("End")}</span> <div
                    ref="end" className="sort-icon"></div></div>),
                (<div id="duration" className="sort" onClick={this.handleColumnClick}><span>{_("Duration")}</span> <div
                    ref="duration" className="sort-icon"></div></div>),
            ];
            if (this.props.diff_hosts === true) {
                columnTitles.push((<div id="hostname" className="sort" onClick={this.handleColumnClick}>
                    <span>{_("Hostname")}</span> <div ref="hostname" className="sort-icon"></div></div>));
            }
            return columnTitles;
        }

        getColumns(r) {
            let columns = [r.user,
                formatDateTime(r.start),
                formatDateTime(r.end),
                formatDuration(r.end - r.start)]
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
                            rowId={r.id}
                            columns={columns}
                            navigateToItem={this.navigateToRecording.bind(this, r)} />);
            }
            return (
                <div>
                    <div className="content-header-extra">
                        <table className="form-table-ct">
                            <th>
                                <td className="top">
                                    <label className="control-label" htmlFor="dateSince">Since</label>
                                </td>
                                <td>
                                    <Datetimepicker onDateChange={this.props.onDateSinceChange}
                                        date={this.props.dateSince} />
                                </td>
                                <td className="top">
                                    <label className="control-label" htmlFor="dateUntil">Until</label>
                                </td>
                                <td>
                                    <Datetimepicker onDateChange={this.props.onDateUntilChange}
                                        date={this.props.dateUntil} />
                                </td>
                                <td className="top">
                                    <label className="control-label" htmlFor="username">Username</label>
                                </td>
                                <td>
                                    <UserPicker onUsernameChange={this.props.onUsernameChange}
                                        username={this.props.username} />
                                </td>
                                <td className="top">
                                    <label className="control-label" htmlFor="hostname">Hostname</label>
                                </td>
                                <td>
                                    <HostnamePicker onHostnameChange={this.props.onHostnameChange}
                                                    hostname={this.props.hostname}/>
                                </td>
                                <td className="top">
                                    <label className="control-label" htmlFor="config">Configuration</label>
                                </td>
                                <td className="top">
                                    <a href="/cockpit/@localhost/session-recording/config.html" className="btn btn-default" data-toggle="modal">
                                        <i className="fa fa-cog" aria-hidden="true" /></a>
                                </td>
                            </th>
                        </table>
                    </div>
                    <Listing.Listing title={_("Sessions")}
                                     columnTitles={columnTitles}
                                     emptyCaption={_("No recorded sessions")}
                                     fullWidth={false}>
                        {rows}
                    </Listing.Listing>
                </div>
            );
        }
    };

    /*
     * A component representing the view upon a list of recordings, or a
     * single recording. Extracts the ID of the recording to display from
     * cockpit.location.path[0]. If it's zero, displays the list.
     */
    let View = class extends React.Component {
        constructor(props) {
            super(props);
            this.onLocationChanged = this.onLocationChanged.bind(this);
            this.journalctlIngest = this.journalctlIngest.bind(this);
            this.handleDateSinceChange = this.handleDateSinceChange.bind(this);
            this.handleDateUntilChange = this.handleDateUntilChange.bind(this);
            this.handleUsernameChange = this.handleUsernameChange.bind(this);
            this.handleHostnameChange = this.handleHostnameChange.bind(this);
            this.handleTsChange = this.handleTsChange.bind(this);
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
                dateSince: cockpit.location.options.dateSince || null,
                dateSinceLastValid: null,
                dateUntil: cockpit.location.options.dateUntil || null,
                dateUntilLastValid: null,
                /* value to filter recordings by username */
                username: cockpit.location.options.username || null,
                hostname: cockpit.location.options.hostname || null,
                error_tlog_uid: false,
                diff_hosts: false,
                curTs: null,
            }
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
                dateSince: cockpit.location.options.dateSince || null,
                dateUntil: cockpit.location.options.dateUntil || null,
                username: cockpit.location.options.username || null,
                hostname: cockpit.location.options.hostname || null,
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
                    if (hostname != e["_HOSTNAME"]) {
                        this.setState({diff_hosts: true});
                    }

                    r = {id:            id,
                         matchList:     ["_UID=" + this.uid,
                             "TLOG_REC=" + id],
                         user:          e["TLOG_USER"],
                         boot_id:       e["_BOOT_ID"],
                         session_id:    parseInt(e["TLOG_SESSION"], 10),
                         pid:           parseInt(e["_PID"], 10),
                         start:         ts,
                         /* FIXME Should be start + message duration */
                         end:       ts,
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
            let matches = ["_UID=" + this.uid];
            if (this.state.username) {
                matches.push("TLOG_USER=" + this.state.username);
            }
            if (this.state.hostname && this.state.hostname != null &&
                this.state.hostname != "") {
                matches.push("_HOSTNAME=" + this.state.hostname);
            }

            let options = {follow: true, count: "all"};

            if (this.state.dateSinceLastValid) {
                options['since'] = this.state.dateSinceLastValid;
            }

            if (this.state.dateUntil) {
                options['until'] = this.state.dateUntilLastValid;
            }

            if (this.state.recordingID !== null) {
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

        handleDateSinceChange(date, last_valid) {
            this.setState({dateSinceLastValid: last_valid});
            cockpit.location.go([], $.extend(cockpit.location.options, { dateSince: date }));
        }

        handleDateUntilChange(date, last_valid) {
            this.setState({dateUntilLastValid: last_valid});
            cockpit.location.go([], $.extend(cockpit.location.options, { dateUntil: date }));
        }

        handleUsernameChange(username) {
            cockpit.location.go([], $.extend(cockpit.location.options, { username: username }));
        }

        handleHostnameChange(hostname) {
            cockpit.location.go([], $.extend(cockpit.location.options, { hostname: hostname }));
        }

        handleTsChange(ts) {
            this.setState({curTs: ts});
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

            let dateSince = parseDate(this.state.dateSince);

            if (dateSince && dateSince != true) {
                this.setState({dateSinceLastValid: dateSince});
            }

            let dateUntil = parseDate(this.state.dateUntil);

            if (dateUntil && dateUntil != true) {
                this.setState({dateUntilLastValid: dateUntil});
            }

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
                this.state.recordingID != prevState.recordingID) {
                if (this.journalctlIsRunning()) {
                    this.journalctlStop();
                }
                this.journalctlStart();
            }
            if (this.state.dateSinceLastValid != prevState.dateSinceLastValid ||
                this.state.dateUntilLastValid != prevState.dateUntilLastValid ||
                this.state.username != prevState.username ||
                this.state.hostname != prevState.hostname
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
                    <RecordingList
                        onDateSinceChange={this.handleDateSinceChange} dateSince={this.state.dateSince}
                        onDateUntilChange={this.handleDateUntilChange} dateUntil={this.state.dateUntil}
                        onUsernameChange={this.handleUsernameChange} username={this.state.username}
                        onHostnameChange={this.handleHostnameChange} hostname={this.state.hostname}
                        list={this.state.recordingList} diff_hosts={this.state.diff_hosts} />
                );
            } else {
                return (
                    <div>
                        <Recording recording={this.recordingMap[this.state.recordingID]} onTsChange={this.handleTsChange} />
                        <div className="container-fluid">
                            <div className="row">
                                <div className="col-md-12">
                                    <Logs recording={this.recordingMap[this.state.recordingID]} curTs={this.state.curTs} />
                                </div>
                            </div>
                        </div>
                    </div>
                );
            }
        }
    };

    React.render(<View />, document.getElementById('view'));
}());
