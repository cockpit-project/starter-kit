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
import { Alert, Card, CardTitle, CardHeader, CardBody, CardExpandableContent, Checkbox, Button, Spinner, Flex, FlexItem } from '@patternfly/react-core';
import { FanIcon, ThermometerHalfIcon, ChargingStationIcon, CpuIcon, EyeSlashIcon } from '@patternfly/react-icons/dist/esm/icons/';

const _ = cockpit.gettext;

export class Application extends React.Component {
    constructor() {
        super();
        this.state = { sensors: {}, intervalId: {}, alert: null, fahrenheitTemp: [], fahrenheitChecked: false, isShowBtnInstall: false, sensorArgumet: "-j", isShowLoading: false, isExpanded: {}, expandAllCards: false, isError: false, hidedCards: [] };
    }

    componentDidMount() {
        const storageHidedCards = localStorage.getItem('hidedCards');
        const hidedCards = storageHidedCards != null && storageHidedCards !== '' ? storageHidedCards.split(',') : [];
        const fahrenheitChecked = Boolean(localStorage.getItem('fahrenheitChecked')) || false;
        const isExpanded = JSON.parse(localStorage.getItem('isExpanded')) || {};
        const intervalId = setInterval(() => {
            if (!this.state.isShowBtnInstall && !this.state.isError)
                this.loadSensors();
        }, 1000);
        this.setState({ intervalId, hidedCards, fahrenheitChecked, isExpanded });
    }

    componentWillUnmount() {
        clearInterval(this.state.intervalId);
    }

    loadSensors = () => {
        cockpit
                .spawn(["sensors", this.state.sensorArgumet], { err: "message", superuser: "try" })
                .done((sucess) => {
                    if (this.state.sensorArgumet === "-j") {
                        this.setState({ sensors: JSON.parse(sucess), isShowBtnInstall: false });
                    } else {
                        const sensorsJson = {};
                        sucess.split(/\n\s*\n/).forEach(raw => {
                            let sensorsGroupName = "";
                            let index = 0;
                            let sensorTitle = "";
                            raw.split(/\n\s*/).forEach(element => {
                                if (index === 0) {
                                    sensorsGroupName = element;
                                    sensorsJson[sensorsGroupName] = {};
                                }
                                if (index === 1) {
                                    const adapter = element.split(":");
                                    sensorsJson[sensorsGroupName][adapter[0]] = adapter[1].trim();
                                }
                                if (index >= 2) {
                                    const sensor = element.trim().split(":");
                                    if (sensor[1] === "") {
                                        sensorTitle = element.split(":")[0];
                                        sensorsJson[sensorsGroupName][sensorTitle] = {};
                                    } else {
                                        sensorsJson[sensorsGroupName][sensorTitle][sensor[0]] = parseFloat(sensor[1].trim());
                                    }
                                }

                                index += 1;
                            });
                        });
                        this.setState({ sensors: sensorsJson, isShowBtnInstall: false });
                    }
                })
                .fail((err) => {
                    if (err.message === "not-found") {
                        this.setState({ isShowBtnInstall: true });
                        this.setAlert(_('lm-sensors not found, you want install it ?'), 'danger');
                        this.getLmSensorsInstallCmd(0);
                        return;
                    }
                    if (err.message === "sensors: invalid option -- 'j'") {
                        this.setState({ sensorArgumet: "-u" });
                        return;
                    }

                    if (err.message === "sensors: invalid option -- 'u'") {
                        this.setAlert(_("this version of lm-sensors don't suport output sensors data!"), 'danger');
                        this.setState({ isError: true });
                        return;
                    }
                    this.setAlert(err.message, 'warning');
                    clearInterval(this.state.intervalId);
                });
    };

    setIcon = (name) => {
        if (typeof name !== 'undefined') {
            if (name.includes('fan')) {
                return <FanIcon size='md' />;
            }
            if (name.includes('temp')) {
                return <ThermometerHalfIcon size='md' />;
            }
            if (name.includes('in')) {
                return <ChargingStationIcon size='md' />;
            }
            if (name.includes('cpu')) {
                return <CpuIcon size='md' />;
            }
        }
        return <></>;
    };

    adjustLabel = (label) => {
        return label.replace(label.substring(0, label.indexOf('_')) + '_', '');
    };

    setAlert = (msg, variant) => {
        this.setState({ alert: { msg, variant } });
    };

    handleChangeFahrenheit = (event, checked) => {
        this.setState({ fahrenheitChecked: checked });
        localStorage.setItem('fahrenheitChecked', checked);
        if (checked) {
            this.setState({ fahrenheitTemp: ['-f'] });
        } else {
            this.setState({ fahrenheitTemp: [] });
        }
    };

    handleChangeCards = (event, checked) => {
        const isExpanded = this.state.isExpanded;
        Object.keys(isExpanded).forEach((element) => {
            isExpanded[element] = checked;
        });
        localStorage.setItem('isExpanded', JSON.stringify(isExpanded));
        this.setState({ isExpanded, expandAllCards: checked });
    };

    lstPacktsManager = ["apk", "apt-get", "dnf", "zypper"];
    installCmd = null;
    getLmSensorsInstallCmd = async (index) => {
        const cmd = this.lstPacktsManager[index];
        await cockpit.spawn([cmd, "-v"])
                .then((sucesso) => {
                    switch (cmd) {
                    case "apk":
                        this.installCmd = [cmd, "add", "--no-cache", "lm-sensors", "-y"];
                        break;
                    case "dnf":
                        this.installCmd = [cmd, "install", "lm_sensors", "-y"];
                        break;
                    case "zypper":
                        this.installCmd = [cmd, "install", "-y", "sensors"];
                        break;
                    case "apt-get":
                    default:
                        this.installCmd = [cmd, "install", "lm-sensors", "-y"];
                    }
                })
                .fail((e) => {
                    this.getLmSensorsInstallCmd(index + 1);
                });
    };

    handleInstallSensors = async () => {
        this.setState({ isShowLoading: true });
        cockpit.spawn(this.installCmd, { err: "message", superuser: "require" })
                .done((sucess) => {
                    this.setState({ isShowLoading: false, isShowBtnInstall: false, alert: null });
                    cockpit.spawn(["sensors-detect", "--auto"], { err: "message", superuser: "require" })
                            .done((sucess) => {
                                cockpit.spawn(["modprobe", "coretemp"], { err: "message", superuser: "require" });
                                cockpit.spawn(["modprobe", "i2c-i801"], { err: "message", superuser: "require" });
                                cockpit.spawn(["modprobe", "drivetemp"], { err: "message", superuser: "require" });
                            })
                            .fail((err) => {
                                this.setAlert(err.message, 'warning');
                            });
                })
                .fail((err) => {
                    this.setState({ isShowLoading: false, isShowBtnInstall: true });
                    this.setAlert(err.message, 'warning');
                });
    };

    adjustValue = (name, value) => {
        if (typeof name !== 'undefined') {
            if (name.includes('temp')) {
                return this.state.fahrenheitChecked
                    ? parseFloat((value * 9 / 5) + 32).toFixed(1)
                            .toString()
                            .concat(' °F')
                    : parseFloat(value).toFixed(1)
                            .toString()
                            .concat(' °C');
            }

            if (name.includes('fan')) {
                return value.toString().concat(' RPM');
            }
        }
        return value;
    };

    handleOnExpand = (event, id) => {
        const isExpanded = this.state.isExpanded;
        isExpanded[id] = !isExpanded[id];
        this.setState({ isExpanded });
    };

    hideCard(cardId) {
        const hidedCards = this.state.hidedCards;
        hidedCards.push(cardId);
        localStorage.setItem('hidedCards', hidedCards);
        this.setState({ hidedCards });
    }

    handleShowHidedCards() {
        const hidedCards = [];
        localStorage.setItem('hidedCards', hidedCards);
        this.setState({ hidedCards });
    }

    render() {
        const { sensors, alert, fahrenheitChecked, isShowBtnInstall, isShowLoading, isExpanded, expandAllCards, hidedCards } = this.state;
        return (
            <>
                <Card>
                    <CardTitle>{_('Sensors')}</CardTitle>
                    <CardBody>
                        <Checkbox
                            label={_("Show temperature in Fahrenheit")}
                            isChecked={fahrenheitChecked}
                            onChange={this.handleChangeFahrenheit}
                            id="fahrenheit-checkbox"
                            name="fahrenheit-checkbox"
                        />
                        <Checkbox
                            label={_("Expand all cards")}
                            isChecked={expandAllCards}
                            onChange={this.handleChangeCards}
                            id="allcards-checkbox"
                            name="allcards-checkbox"
                        />
                        {isShowLoading ? <Spinner isSVG /> : <></>}
                        {alert != null ? <Alert variant={alert.variant}>{alert.msg}</Alert> : <></>}
                        {isShowBtnInstall ? <Button onClick={this.handleInstallSensors}>{_('Install')}</Button> : <></>}
                        {hidedCards.length > 0 ? <Button onClick={() => this.handleShowHidedCards()}>{_('Show hided cards')}</Button> : <></>}

                        {sensors !== null
                            ? Object.entries(sensors).map((key, keyIndex) => {
                                if (hidedCards.includes(key[0])) {
                                    return ('');
                                }
                                return (
                                    <Card key={key}>
                                        <CardTitle>{key[0]}
                                            <Button variant="plain" aria-label="Action" onClick={() => this.hideCard(key[0])}>
                                                <EyeSlashIcon />
                                            </Button>
                                        </CardTitle>

                                        <CardBody>
                                            <CardTitle>{key[1].Adapter}</CardTitle>

                                            <Flex key={key[1]}>
                                                {Object.entries(key[1]).map((item, itemIndex) => {
                                                    if (itemIndex === 0) return "";
                                                    const chave = keyIndex.toString() + itemIndex.toString();
                                                    if (isExpanded[chave] === undefined) {
                                                        isExpanded[chave] = false;
                                                    }
                                                    if (hidedCards.includes(chave)) {
                                                        return ('');
                                                    }
                                                    return (
                                                        <FlexItem key={item} style={{ width: "15%" }}>

                                                            <Card key={item} id="expandable-card-icon" isExpanded={isExpanded[chave]}>
                                                                <CardHeader
                                                                    style={{ justifyContent: 'normal' }}
                                                                    onExpand={(e) => this.handleOnExpand(e, chave)}
                                                                    toggleButtonProps={{
                                                                        id: 'toggle-button2',
                                                                        'aria-label': 'Patternfly Details',
                                                                        'aria-expanded': isExpanded[chave]
                                                                    }}
                                                                ><CardTitle>{item[0]}</CardTitle>
                                                                    <Button variant="plain" aria-label="Action" onClick={() => this.hideCard(chave)}>
                                                                        <EyeSlashIcon />
                                                                    </Button>
                                                                </CardHeader>
                                                                <CardTitle>{this.setIcon(Object.keys(item[1])[0])} {this.adjustValue(Object.keys(item[1])[0], Object.values(item[1])[0])}
                                                                </CardTitle>
                                                                <CardExpandableContent>
                                                                    <CardBody>
                                                                        {Object.entries(item[1]).map((sensors, index) => (
                                                                            <span key={sensors}>{this.adjustLabel(sensors[0])}: {sensors[1]}<br /></span>
                                                                        ))}
                                                                    </CardBody>
                                                                </CardExpandableContent>
                                                            </Card>
                                                        </FlexItem>
                                                    );
                                                })}
                                            </Flex>
                                        </CardBody>
                                    </Card>
                                );
                            }
                            )
                            : ''}
                    </CardBody>
                </Card>
            </>
        );
    }
}
