/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2024 Red Hat, Inc.
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

import { css, html, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import '@patternfly/elements/pf-card/pf-card.js';

import cockpit from 'cockpit';

const _ = cockpit.gettext;

@customElement('ct-application')
export class Application extends LitElement {
    @state() private accessor hostname = _("Unknown");

    static readonly styles = css`
        .running-on {
            color: green;
        }
    `;

    connectedCallback() {
        super.connectedCallback();
        const hostname = cockpit.file('/etc/hostname');
        hostname.watch(content => { this.hostname = content?.trim() ?? "" });
    }

    render() {
        return html`
            <pf-card>
                <h1 slot="header">Starter Kit</h1>
                <p class="running-on">${cockpit.format(_("Running on $0"), this.hostname)}</p>
            </pf-card>`;
    }
}
