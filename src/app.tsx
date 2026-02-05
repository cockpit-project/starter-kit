/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2017 Red Hat, Inc.
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
