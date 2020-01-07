
/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2020 Red Hat, Inc.
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

// import cockpit from "cockpit";
import React from "react";
import moment from "moment";

import { Accordion, AccordionItem, AccordionContent, AccordionToggle, Flex, FlexItem, FlexModifiers } from "@patternfly/react-core";

import '../lib/form-layout.less';
import { getRequests, getRequest } from "./dbus.js";

const _ = cockpit.gettext;
function prettyTime(unixTime) {
    moment.locale(cockpit.language, {
        longDateFormat : {
            LT: "hh:mm:ss",
            L: "DD/MM/YYYY",
        }
    });
    const yesterday = _("Yesterday");
    const today = _("Today");
    moment.locale(cockpit.language, {
        calendar : {
            lastDay : `[${yesterday}] LT`,
            sameDay : `[${today}] LT`,
            sameElse : "L LT"
        }
    });

    return moment(Number(unixTime) * 1000).calendar();
}

class CertificateList extends React.Component {
    constructor() {
        super();
        this.state = {
            certs: [],
            expanded: [],
        };
        this.toggle = this.toggle.bind(this);
        this.onValueChanged = this.onValueChanged.bind(this);

        getRequests()
                .fail(error => {
                    console.log(JSON.stringify(error)); // TODO better error handling
                })
                .then(paths => {
                    paths[0].forEach(p => {
                        getRequest(p)
                                .fail(error => {
                                    console.log(JSON.stringify(error)); // TODO better error handling
                                })
                                .then(ret => {
                                    const certs = [...this.state.certs, ret[0]];
                                    this.onValueChanged("certs", certs);
                                });
                    });
                });
    }

    toggle(certId) {
        const expanded = [...this.state.expanded];
        const certIndex = expanded.findIndex(e => e === certId);

        if (certIndex < 0)
            expanded.push(certId);
        else
            expanded.splice(certIndex, 1);

        this.setState({ expanded });
    }

    onValueChanged(key, value) {
        this.setState({ [key]: value });
    }

    render() {
        const certs = this.state.certs;

        console.log(certs);
        const items = certs.map(cert => (
            <AccordionItem key={cert.nickname.v}>
                <AccordionToggle
                    onClick={() => this.toggle(cert.nickname.v)}
                    isExpanded={this.state.expanded.includes(cert.nickname.v)}
                    id={cert.nickname.v + "toggle"}
                >
                    {cert["cert-nickname"].v}
                </AccordionToggle>
                <AccordionContent
                    id={cert.nickname.v + "content"}
                    isHidden={!this.state.expanded.includes(cert.nickname.v)}
                    isFixed
                >
                    <div className="overview-tab-grid">
                        <label className='control-label label-title'> {_("General")} </label>
                        <span />
                        <Flex breakpointMods={[{modifier: FlexModifiers["justify-content-space-between"]}]}>
                            <Flex breakpointMods={[{modifier: FlexModifiers["column", "flex-1"]}]}>
                                <div className="ct-form">
                                    <label className='control-label label-title'>{_("Status")}</label>
                                    <div>{cert.status.v}</div>
                                    <label className='control-label label-title'>{_("Auto-renewal")}</label>
                                    <div>{cert.autorenew.v ? _("Yes") : _("No")}</div>
                                    <label className='control-label label-title'>{_("Stuck")}</label>
                                    <div>{cert.stuck.v ? _("Yes") : _("No")}</div>
                                </div>
                            </Flex>
                            <Flex breakpointMods={[{modifier: FlexModifiers["column", "flex-1"]}]}>
                                <div className="ct-form">
                                    <label className='control-label label-title'>{_("Not valid after")}</label>
                                    <div>{prettyTime(cert["not-valid-after"].v)}</div>
                                    <label className='control-label label-title'>{_("Not valid before")}</label>
                                    <div>{prettyTime(cert["not-valid-before"].v)}</div>
                                </div>
                            </Flex>
                        </Flex>

                        <label className='control-label label-title'> {_("Key")} </label>
                        <span />
                        <Flex breakpointMods={[{modifier: FlexModifiers["justify-content-space-between"]}]}>
                            <Flex breakpointMods={[{modifier: FlexModifiers["column", "flex-1"]}]}>
                                <div className="ct-form">
                                    <label className='control-label label-title'>{_("Nickname")}</label>
                                    <div>{cert["key-nickname"].v}</div>
                                    <label className='control-label label-title'>{_("Type")}</label>
                                    <div>{cert["key-type"].v}</div>
                                    <label className='control-label label-title'>{_("Token")}</label>
                                    <div>{cert["key-token"].v}</div>
                                </div>
                            </Flex>
                            <Flex breakpointMods={[{modifier: FlexModifiers["column", "flex-1"]}]}>
                                <div className="ct-form">
                                    <label className='control-label label-title'>{_("Location")}</label>
                                    <div>{cert["key-database"].v}</div>
                                    <label className='control-label label-title'>{_("Storage")}</label>
                                    <div>{cert["key-storage"].v}</div>
                                </div>
                            </Flex>
                        </Flex>

                        <label className='control-label label-title'> {_("Cert")} </label>
                        <span />
                        <Flex breakpointMods={[{modifier: FlexModifiers["justify-content-space-between"]}]}>
                            <Flex breakpointMods={[{modifier: FlexModifiers["column", "flex-1"]}]}>
                                <div className="ct-form">
                                    <label className='control-label label-title'>{_("Nickname")}</label>
                                    <div>{cert["cert-nickname"].v}</div>
                                    <label className='control-label label-title'>{_("Token")}</label>
                                    <div>{cert["cert-token"].v}</div>
                                </div>
                            </Flex>
                            <Flex breakpointMods={[{modifier: FlexModifiers["column", "flex-1"]}]}>
                                <div className="ct-form">
                                    <label className='control-label label-title'>{_("Location")}</label>
                                    <div>{cert["cert-database"].v}</div>
                                    <label className='control-label label-title'>{_("Storage")}</label>
                                    <div>{cert["cert-storage"].v}</div>
                                </div>
                            </Flex>
                        </Flex>
                    </div>
                </AccordionContent>
            </AccordionItem>
        ));

        return (
            <Accordion asDefinitionList={false}>
                {items}
            </Accordion>
        );
    }
}

export default CertificateList;
