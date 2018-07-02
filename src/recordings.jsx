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
        }

        goBackToList() {
            if (cockpit.location.path[0]) {
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
                        matchList={this.props.recording.matchList} />);

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
                            <div className="col-md-6">
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
                            <div className="col-md-6 player-wrap">
                                {player}
                            </div>
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

        render() {
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
            let list = this.getSortedList();
            let rows = [];

            for (let i = 0; i < list.length; i++) {
                let r = list[i];
                let columns = [r.user,
                    formatDateTime(r.start),
                    formatDateTime(r.end),
                    formatDuration(r.end - r.start)];
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
                                    <label className="control-label" htmlFor="config">Configuration</label>
                                </td>
                                <td className="top">
                                    <a href="/cockpit/@localhost/session_recording/config.html" className="btn btn-default" data-toggle="modal">
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
                error_tlog_uid: false,
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
            });
        }

        /*
         * Ingest journal entries sent by journalctl.
         */
        journalctlIngest(entryList) {
            let recordingList = this.state.recordingList.slice();
            let i;
            let j;

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
                this.state.username != prevState.username
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
                        list={this.state.recordingList} />
                );
            } else {
                return (
                    <Recording recording={this.recordingMap[this.state.recordingID]} />
                );
            }
        }
    };

    React.render(<View />, document.getElementById('view'));
}());
