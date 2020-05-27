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

import cockpit from 'cockpit';
import React from 'react';
import { Alert, Card, CardHead, CardHeader, CardHeadMain, Title } from '@patternfly/react-core';
import './app.scss';

const _ = cockpit.gettext;

export class Application extends React.Component {
    constructor() {
        super();
        this.state = { hostname: _("Unknown") };

        cockpit.file('/etc/hostname').watch(content => {
            this.setState({ hostname: content.trim() });
        });
    }

    render() {
        return (
            <Card>
                <CardHead>
                    <CardHeadMain>
                        <Title headingLevel="h2" size="3xl">Starter Kit</Title>
                    </CardHeadMain>
                </CardHead>
                <CardHeader>
                    <Alert
                        variant="default"
                        title={ cockpit.format(_("Running on $0"), this.state.hostname) }
                    />
                </CardHeader>
            </Card>
        );
    }
}
