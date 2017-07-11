import React, { Component } from 'react';

function TestComponent(props) {
    return (
        <p>Hello {props.name}</p>
    );
}

export default class TestApp extends Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="testing">
                This is just a test
                <TestComponent name="Sean"/>
            </div>
        );
    }
}
