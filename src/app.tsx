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

import React, { useEffect, useState } from 'react';
import { Alert } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Card, CardBody, CardTitle } from "@patternfly/react-core/dist/esm/components/Card/index.js";

import cockpit from 'cockpit';

const _ = cockpit.gettext;

export const Application = () => {
    const [hostname, setHostname] = useState(_("Unknown"));

    useEffect(() => {
        const hostname = cockpit.file('/etc/hostname');
        hostname.watch(content => setHostname(content?.trim() ?? ""));
        return hostname.close;
    }, []);

    return (
        <Card>
            <CardTitle>Starter Kit</CardTitle>
            <CardBody>
                <Alert
                    variant="info"
                    title={ cockpit.format(_("Running on $0"), hostname) }
                />
            </CardBody>
        </Card>
    );
};
