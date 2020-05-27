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

let cockpit = require("cockpit");
let React = require("react");
let ReactDOM = require("react-dom");
let json = require('comment-json');
let ini = require('ini');

class Config extends React.Component {
    constructor(props) {
        super(props);
        this.handleInputChange = this.handleInputChange.bind(this);
        this.handleSubmit = this.handleSubmit.bind(this);
        this.setConfig = this.setConfig.bind(this);
        this.fileReadFailed = this.fileReadFailed.bind(this);
        this.readConfig = this.readConfig.bind(this);
        this.file = null;
        this.config = null;
        this.state = {
            config_loaded: false,
            file_error: false,
            submitting: "none",
            shell: "",
            notice: "",
            latency: "",
            payload: "",
            log_input: false,
            log_output: true,
            log_window: true,
            limit_rate: "",
            limit_burst: "",
            limit_action: "",
            file_path: "",
            syslog_facility: "",
            syslog_priority: "",
            journal_augment: "",
            journal_priority: "",
            writer: "",
        };
    }

    handleInputChange(e) {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        const name = e.target.name;
        const state = {};
        state[name] = value;
        this.setState(state);
    }

    handleSubmit(event) {
        this.setState({submitting:"block"});
        let config = {
            shell:  this.state.shell,
            notice:  this.state.notice,
            latency:  parseInt(this.state.latency),
            payload:  parseInt(this.state.payload),
            log:  {
                input:  this.state.log_input,
                output:  this.state.log_output,
                window:  this.state.log_window,
            },
            limit:  {
                rate:  parseInt(this.state.limit_rate),
                burst:  parseInt(this.state.limit_burst),
                action:  this.state.limit_action,
            },
            file:  {
                path:  this.state.file_path,
            },
            syslog:  {
                facility:  this.state.syslog_facility,
                priority:  this.state.syslog_priority,
            },
            journal:  {
                priority:  this.state.journal_priority,
                augment:  this.state.journal_augment
            },
            writer:  this.state.writer
        };
        this.file.replace(config).done(() => {
            this.setState({submitting:"none"});
        })
                .fail((error) => {
                    console.log(error);
                });
        event.preventDefault();
    }

    setConfig(data) {
        delete data.configuration;
        delete data.args;
        var flattenObject = function(ob) {
            var toReturn = {};

            for (var i in ob) {
                if (!ob.hasOwnProperty(i)) continue;

                if ((typeof ob[i]) == 'object') {
                    var flatObject = flattenObject(ob[i]);
                    for (var x in flatObject) {
                        if (!flatObject.hasOwnProperty(x)) continue;

                        toReturn[i + '_' + x] = flatObject[x];
                    }
                } else {
                    toReturn[i] = ob[i];
                }
            }
            return toReturn;
        };
        let state = flattenObject(data);
        state.config_loaded = true;
        this.setState(state);
    }

    getConfig() {
        let proc = cockpit.spawn(["tlog-rec-session", "--configuration"]);

        proc.stream((data) => {
            this.setConfig(json.parse(data, null, true));
            proc.close();
        });

        proc.fail((fail) => {
            console.log(fail);
            this.readConfig();
        });
    }

    readConfig() {
        let parseFunc = function(data) {
            return json.parse(data, null, true);
        };

        let stringifyFunc = function(data) {
            return json.stringify(data, null, true);
        };
        // needed for cockpit.file usage
        let syntax_object = {
            parse: parseFunc,
            stringify: stringifyFunc,
        };

        this.file = cockpit.file("/etc/tlog/tlog-rec-session.conf", {
            syntax: syntax_object,
            superuser: true,
        });
        /*
        let promise = this.file.read();

        promise.done((data) => {
            if (data === null) {
                this.fileReadFailed();
            }
        }).fail((data) => {
            this.fileReadFailed(data);
        });
        */
    }

    fileReadFailed(reason) {
        console.log(reason);
        this.setState({file_error: reason});
    }

    componentDidMount() {
        this.getConfig();
        this.readConfig();
    }

    render() {
        if (this.state.config_loaded === false && this.state.file_error === false) {
            return (
                <div>Loading</div>
            );
        } else if (this.state.config_loaded === true && this.state.file_error === false) {
            return (
                <form onSubmit={this.handleSubmit}>
                    <table className="form-table-ct col-sm-3">
                        <tbody>
                            <tr>
                                <td className="top"><label htmlFor="shell" className="control-label">Shell</label></td>
                                <td>
                                    <input type="text" id="shell" name="shell" value={this.state.shell}
                                       className="form-control" onChange={this.handleInputChange} />
                                </td>
                            </tr>
                            <tr>
                                <td className="top"><label htmlFor="notice" className="control-label">Notice</label></td>
                                <td>
                                    <input type="text" id="notice" name="notice" value={this.state.notice}
                                       className="form-control" onChange={this.handleInputChange} />
                                </td>
                            </tr>
                            <tr>
                                <td className="top"><label htmlFor="latency" className="control-label">Latency</label></td>
                                <td>
                                    <input type="number" step="1" id="latency" name="latency" value={this.state.latency}
                                       className="form-control" onChange={this.handleInputChange} />
                                </td>
                            </tr>
                            <tr>
                                <td className="top"><label htmlFor="latency" className="control-label">Payload Size, bytes</label></td>
                                <td>
                                    <input type="number" step="1" id="payload" name="payload" value={this.state.payload}
                                       className="form-control" onChange={this.handleInputChange} />
                                </td>
                            </tr>
                            <tr>
                                <td className="top"><label htmlFor="log_input" className="control-label">Log User's Input</label></td>
                                <td>
                                    <input type="checkbox" id="log_input" name="log_input" defaultChecked={this.state.log_input} onChange={this.handleInputChange} />
                                </td>
                            </tr>
                            <tr>
                                <td className="top"><label htmlFor="log_output" className="control-label">Log User's Output</label></td>
                                <td>
                                    <input type="checkbox" id="log_output" name="log_output" defaultChecked={this.state.log_output} onChange={this.handleInputChange} />
                                </td>
                            </tr>
                            <tr>
                                <td className="top"><label htmlFor="log_window" className="control-label">Log Window Resize</label></td>
                                <td>
                                    <input type="checkbox" id="log_window" name="log_window" defaultChecked={this.state.log_window} onChange={this.handleInputChange} />
                                </td>
                            </tr>

                            <tr>
                                <td className="top"><label htmlFor="limit_rate" className="control-label">Limit Rate, bytes/sec</label></td>
                                <td>
                                    <input type="number" step="1" id="limit_rate" name="limit_rate" value={this.state.limit_rate}
                                       className="form-control" onChange={this.handleInputChange} />
                                </td>
                            </tr>
                            <tr>
                                <td className="top"><label htmlFor="limit_burst" className="control-label">Burst, bytes</label></td>
                                <td>
                                    <input type="number" step="1" id="limit_burst" name="limit_burst" value={this.state.limit_burst}
                                       className="form-control" onChange={this.handleInputChange} />
                                </td>
                            </tr>
                            <tr>
                                <td className="top"><label htmlFor="limit_action" className="control-label">Logging Limit Action</label></td>
                                <td>
                                    <select name="limit_action" id="limit_action" onChange={this.handleInputChange} value={this.state.limit_action} className="form-control">
                                        <option value="" />
                                        <option value="pass">Pass</option>
                                        <option value="delay">Delay</option>
                                        <option value="drop">Drop</option>
                                    </select>
                                </td>
                            </tr>
                            <tr>
                                <td className="top"><label htmlFor="file_path" className="control-label">File Path</label></td>
                                <td>
                                    <input type="text" id="file_path" name="file_path" defaultChecked={this.state.file_path}
                                       className="form-control" onChange={this.handleInputChange} />
                                </td>
                            </tr>
                            <tr>
                                <td className="top"><label htmlFor="syslog_facility" className="control-label">Syslog Facility</label></td>
                                <td>
                                    <input type="text" id="syslog_facility" name="syslog_facility" value={this.state.syslog_facility}
                                       className="form-control" onChange={this.handleInputChange} />
                                </td>
                            </tr>
                            <tr>
                                <td className="top"><label htmlFor="syslog_priority" className="control-label">Syslog Priority</label></td>
                                <td>
                                    <select name="syslog_priority" id="syslog_priority" onChange={this.handleInputChange} value={this.state.syslog_priority} className="form-control">
                                        <option value="" />
                                        <option value="info">Info</option>
                                    </select>
                                </td>
                            </tr>
                            <tr>
                                <td className="top"><label htmlFor="journal_priority" className="control-label">Journal Priority</label></td>
                                <td>
                                    <select name="journal_priority" id="journal_priority" onChange={this.handleInputChange} value={this.state.journal_priority} className="form-control">
                                        <option value="" />
                                        <option value="info">Info</option>
                                    </select>
                                </td>
                            </tr>
                            <tr>
                                <td className="top"><label htmlFor="journal_augment" className="control-label">Journal Augment</label></td>
                                <td>
                                    <input type="checkbox" id="journal_augment" name="journal_augment" defaultChecked={this.state.journal_augment} onChange={this.handleInputChange} />
                                </td>

                            </tr>
                            <tr>
                                <td className="top"><label htmlFor="writer" className="control-label">Writer</label></td>
                                <td>
                                    <select name="writer" id="writer" onChange={this.handleInputChange} value={this.state.writer} className="form-control">
                                        <option value="" />
                                        <option value="journal">Journal</option>
                                        <option value="syslog">Syslog</option>
                                        <option value="file">File</option>
                                    </select>

                                </td>
                            </tr>
                            <tr>
                                <td className="top">
                                    <button id="btn-save-tlog-conf" className="btn btn-default" type="submit">Save</button>
                                </td>
                                <td>
                                    <span style={{display: this.state.submitting}}>Saving...</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </form>
            );
        } else {
            return (
                <div className="alert alert-danger">
                    <span className="pficon pficon-error-circle-o" />
                    <p><strong>There is no configuration file of tlog present in your system.</strong></p>
                    <p>Please, check the /etc/tlog/tlog-rec-session.conf or if tlog is installed.</p>
                    <p><strong>{this.state.file_error}</strong></p>
                </div>
            );
        }
    }
}

class SssdConfig extends React.Component {
    constructor(props) {
        super(props);
        this.handleSubmit = this.handleSubmit.bind(this);
        this.handleInputChange = this.handleInputChange.bind(this);
        this.setConfig = this.setConfig.bind(this);
        this.confSave = this.confSave.bind(this);
        this.file = null;
        this.state = {
            scope: "",
            users: "",
            groups: "",
            submitting: "none",
        };
    }

    confSave(obj) {
        this.setState({submitting:"block"});
        this.file.replace(obj).done(() => {
            cockpit.spawn(["chmod", "600", "/etc/sssd/conf.d/sssd-session-recording.conf"], { "superuser": "require" }).done(() => {
                cockpit.spawn(["systemctl", "restart", "sssd"], { "superuser": "require" }).done(() => {
                    this.setState({submitting:"none"});
                })
                        .fail((data) => console.log(data));
            })
                    .fail((data) => console.log(data));
        });
    }

    handleInputChange(e) {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        const name = e.target.name;
        const state = {};
        state[name] = value;
        this.setState(state);
    }

    setConfig(data) {
        if (data === null) {
            const obj = {};
            obj.session_recording = {};
            obj.session_recording.scope = "none";
            this.confSave(obj);
        } else {
            const config = {...data['session_recording']};
            this.setState(config);
        }
    }

    componentDidMount() {
        let syntax_object = {
            parse:     ini.parse,
            stringify: ini.stringify
        };

        this.file = cockpit.file("/etc/sssd/conf.d/sssd-session-recording.conf", {
            syntax: syntax_object,
            superuser: true,
        });

        let promise = this.file.read();

        promise.done(() => this.file.watch(this.setConfig));

        promise.fail(function(error) {
            console.log(error);
        });
    }

    handleSubmit(e) {
        const obj = {};
        obj.session_recording = {};
        obj.session_recording.scope = this.state.scope;
        obj.session_recording.users = this.state.users;
        obj.session_recording.groups = this.state.groups;
        this.confSave(obj);
        e.preventDefault();
    }

    render() {
        return (
            <form onSubmit={this.handleSubmit}>
                <table className="info-table-ct col-md-12">
                    <tbody>
                        <tr>
                            <td><label htmlFor="scope">Scope</label></td>
                            <td>
                                <select name="scope" id="scope" className="form-control"
                                    value={this.state.scope}
                                    onChange={this.handleInputChange} >
                                    <option value="none">None</option>
                                    <option value="some">Some</option>
                                    <option value="all">All</option>
                                </select>
                            </td>
                        </tr>
                        {this.state.scope === "some" &&
                        <tr>
                            <td><label htmlFor="users">Users</label></td>
                            <td>
                                <input type="text" id="users" name="users"
                                   value={this.state.users}
                                   className="form-control" onChange={this.handleInputChange} />
                            </td>
                        </tr>
                        }
                        {this.state.scope === "some" &&
                        <tr>
                            <td><label htmlFor="groups">Groups</label></td>
                            <td>
                                <input type="text" id="groups" name="groups"
                                       value={this.state.groups}
                                       className="form-control" onChange={this.handleInputChange} />
                            </td>
                        </tr>
                        }
                        <tr>
                            <td><button id="btn-save-sssd-conf" className="btn btn-default" type="submit">Save</button></td>
                            <td>
                                <span style={{display: this.state.submitting}}>Saving...</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </form>
        );
    }
}

class ConfigView extends React.Component {
    render() {
        const goBack = () => {
            cockpit.jump(['session-recording']);
        };

        return (
            <div className="container-fluid">
                <div className="row">
                    <div className="col-md-12">
                        <ol className="breadcrumb">
                            <li><a onClick={goBack}>Session
                                Recording</a></li>
                            <li className="active">Configuration</li>
                        </ol>
                    </div>
                </div>
                <div className="row">
                    <div className="col-md-6">
                        <div className="panel panel-default">
                            <div className="panel-heading"><span>General Configuration</span></div>
                            <div className="panel-body" id="sr_config">
                                <Config />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="row">
                    <div className="col-md-4">
                        <div className="panel panel-default">
                            <div className="panel-heading"><span>SSSD Configuration</span></div>
                            <div className="panel-body" id="sssd_config">
                                <SssdConfig />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

ReactDOM.render(<ConfigView />, document.getElementById('view'));
