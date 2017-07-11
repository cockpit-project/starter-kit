// @flow
import React from 'react'
import { shallow, mount, ShallowWrapper } from 'enzyme';

import TestApp, { TestComponent } from "../lib/components/test-component";


var test = require('tape'); // assign the tape library to the variable "test"

test('should return -1 when the value is not present in Array', (t) => {
  let testArray: Array<number> = [1, 2, 3];
  t.equal(-1, testArray.indexOf(4)); // 4 is not present in this array so passes
  t.end();
});

test("should have 'Sean' in the TestComponent sub-component", (t) => {
    const app: ShallowWrapper = shallow(<TestApp />);
    t.equal(app.find("TestComponent").prop("name"), "Sean");
    t.end();
});