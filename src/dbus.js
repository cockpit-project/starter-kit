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

import cockpit from "cockpit";

function dbusCall(objectPath, iface, method, args) {
    const clientCertmonger = cockpit.dbus("org.fedorahosted.certmonger",
                                          { superuser: "try" });

    return clientCertmonger.call(objectPath, iface, method, args);
}

export function getRequest(path) {
    return dbusCall(path, "org.freedesktop.DBus.Properties", "GetAll",
                    ["org.fedorahosted.certmonger.request"]);
}

export function getRequests() {
    return dbusCall("/org/fedorahosted/certmonger", "org.fedorahosted.certmonger",
                    "get_requests", []);
}
