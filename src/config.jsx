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

    let cockpit = require("cockpit");
    let React = require("react");
    let json = require('comment-json');

    let Config = class extends React.Component {
        constructor(props) {
            super(props);
            this.handleInputChange = this.handleInputChange.bind(this);
            this.handleSubmit = this.handleSubmit.bind(this);
            this.setConfig = this.setConfig.bind(this);
            this.prepareConfig = this.prepareConfig.bind(this);
            this.fileReadFailed = this.fileReadFailed.bind(this);
            this.file = null;
            this.state = {
                config: null,
                file_error: null,
                submitting: "none",
            }
        }

        handleInputChange(e) {
            const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
            const name = e.target.name;
            const config = this.state.config;
            config[name] = value;

            this.forceUpdate();
        }

        prepareConfig() {
            this.state.config.latency = parseInt(this.state.config.latency);
            if (this.state.config.input === true) {
                // log.input
            }
        }

        handleSubmit(event) {
            this.setState({submitting:"block"});
            console.log(event);
            this.prepareConfig();
            this.file.replace(this.state.config).done(() => {
                console.log('updated');
                this.setState({submitting:"none"});
            })
                    .fail((error) => {
                        console.log(error);
                    });
            event.preventDefault();
        }

        setConfig(data) {
            console.log(data);
            this.setState({config: data});
        }

        fileReadFailed(reason) {
            console.log(reason);
            this.setState({file_error: reason});
            console.log('failed to read file');
        }

        componentDidMount() {
            let parseFunc = function(data) {
                console.log(data);
                // return data;
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
                // binary: boolean,
                // max_read_size: int,
                superuser: true,
                // host: string
            });

            console.log(this.file);

            let promise = this.file.read();

            promise.done((data) => {
                if (data === null) {
                    this.fileReadFailed();
                    return;
                }
                this.setConfig(data);
            }).fail((data) => {
                this.fileReadFailed(data);
            });
        }

        render() {
            if (this.state.config != null && this.state.file_error === null) {
                return (
                    <form onSubmit={this.handleSubmit}>
                        <table className="form-table-ct col-sm-3">
                            <tbody>
                                <tr>
                                    <td className="top"><label htmlFor="shell" className="control-label">Shell</label></td>
                                    <td>
                                        <input type="text" id="shell" name="shell" value={this.state.config.shell}
                                           className="form-control" onChange={this.handleInputChange} />
                                    </td>
                                </tr>
                                <tr>
                                    <td className="top"><label htmlFor="notice" className="control-label">Notice</label></td>
                                    <td>
                                        <input type="text" id="notice" name="notice" value={this.state.config.notice}
                                           className="form-control" onChange={this.handleInputChange} />
                                    </td>
                                </tr>
                                <tr>
                                    <td className="top"><label htmlFor="latency" className="control-label">Latency</label></td>
                                    <td>
                                        <input type="text" id="latency" name="latency" value={this.state.config.latency}
                                           className="form-control" onChange={this.handleInputChange} />
                                    </td>
                                </tr>
                                <tr>
                                    <td className="top"><label htmlFor="latency" className="control-label">Payload Size, bytes</label></td>
                                    <td>
                                        <input type="text" id="payload" name="payload" value={this.state.config.payload}
                                           className="form-control" onChange={this.handleInputChange} />
                                    </td>
                                </tr>
                                <tr>
                                    <td className="top"><label htmlFor="input" className="control-label">Log User's Input</label></td>
                                    <td>
                                        <input type="checkbox" id="input" name="input" defaultChecked={this.state.config.log.input}
                                           onChange={this.handleInputChange} />
                                    </td>
                                </tr>
                                <tr>
                                    <td className="top"><label htmlFor="output" className="control-label">Log User's Output</label></td>
                                    <td>
                                        <input type="checkbox" id="output" name="output" defaultChecked={this.state.config.log.output}
                                           onChange={this.handleInputChange} />
                                    </td>
                                </tr>
                                <tr>
                                    <td className="top"><label htmlFor="window" className="control-label">Log Window Resize</label></td>
                                    <td>
                                        <input type="checkbox" id="window" name="window" defaultChecked={this.state.config.log.window}
                                           onChange={this.handleInputChange} />
                                    </td>
                                </tr>

                                <tr>
                                    <td className="top"><label htmlFor="rate" className="control-label">Limit Rate, bytes/sec</label></td>
                                    <td>
                                        <input type="text" id="rate" name="rate" value={this.state.config.limit.rate}
                                           className="form-control" onChange={this.handleInputChange} />
                                    </td>
                                </tr>
                                <tr>
                                    <td className="top"><label htmlFor="burst" className="control-label">Burst, bytes</label></td>
                                    <td>
                                        <input type="text" id="burst" name="burst" value={this.state.config.limit.burst}
                                           className="form-control" onChange={this.handleInputChange} />
                                    </td>
                                </tr>
                                <tr>
                                    <td className="top"><label htmlFor="action" className="control-label">Logging Limit Action</label></td>
                                    <td>
                                        <select name="action" id="action" onChange={this.handleInputChange} value={this.state.config.limit.action}>
                                            <option value="" />
                                            <option value="pass">Pass</option>
                                            <option value="delay">Delay</option>
                                            <option value="drop">Drop</option>
                                        </select>
                                    </td>
                                </tr>
                                <tr>
                                    <td className="top"><label htmlFor="path" className="control-label">File Path</label></td>
                                    <td>
                                        <input type="text" id="path" name="path" defaultChecked={this.state.config.file.path}
                                           className="form-control" onChange={this.handleInputChange} />
                                    </td>
                                </tr>
                                <tr>
                                    <td className="top"><label htmlFor="facility" className="control-label">Syslog Facility</label></td>
                                    <td>
                                        <input type="text" id="facility" name="facility" value={this.state.config.syslog.facility}
                                           className="form-control" onChange={this.handleInputChange} />
                                    </td>
                                </tr>
                                <tr>
                                    <td className="top"><label htmlFor="syslog_priority" className="control-label">Syslog Priority</label></td>
                                    <td>
                                        <input type="text" id="syslog_priority" name="syslog_priority" value={this.state.config.syslog.priority}
                                           className="form-control" onChange={this.handleInputChange} />
                                    </td>
                                </tr>
                                <tr>
                                    <td className="top"><label htmlFor="path" className="control-label">Journal Priority</label></td>
                                    <td>
                                        <select name="journal_priority" id="journal_priority" onChange={this.handleInputChange} value={this.state.config.journal.priority}>
                                            <option value="" />
                                            <option value="info">Info</option>
                                        </select>
                                    </td>
                                </tr>
                                <tr>
                                    <td className="top"><label htmlFor="path" className="control-label">Journal Augment</label></td>
                                    <td>
                                        <input type="checkbox" id="augment" name="augment" defaultChecked={this.state.config.journal.augment}
                                           onChange={this.handleInputChange} />
                                    </td>

                                </tr>
                                <tr>
                                    <td className="top"><label htmlFor="path" className="control-label">Writer</label></td>
                                    <td>
                                        <select name="writer" id="writer" onChange={this.handleInputChange} value={this.state.config.writer}>
                                            <option value="" />
                                            <option value="journal">Journal</option>
                                            <option value="syslog">Syslog</option>
                                            <option value="file">File</option>
                                        </select>
                                    </td>
                                </tr>
                                <tr>
                                    <td className="top" />
                                    <div className="spinner spinner-sm" style={{display: this.state.submitting}} />
                                    <td>
                                        <button className="btn btn-default" type="submit">Save</button>

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

    React.render(<Config />, document.getElementById('view'));
}());
