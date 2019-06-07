"use strict";
/* Copyright 2017, Google, Inc.
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * This is the main server code that processes requests and sends responses
 * back to users and to the HomeGraph.
 */
// Express imports
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const morgan = require("morgan");
const ngrok = require("ngrok");
// Smart home imports
const actions_on_google_1 = require("actions-on-google");
// Local imports
const Firestore = require("./firestore");
const Auth = require("./auth-provider");
const Config = require("./config-provider");
const expressApp = express();
expressApp.use(cors());
expressApp.use(morgan('dev'));
expressApp.use(bodyParser.json());
expressApp.use(bodyParser.urlencoded({ extended: true }));
expressApp.set('trust proxy', 1);
Auth.registerAuthEndpoints(expressApp);
let jwt;
try {
    jwt = require('./smart-home-key.json');
}
catch (e) {
    console.warn('Service account key is not found');
    console.warn('Report state and Request sync will be unavailable');
}
const app = actions_on_google_1.smarthome({
    jwt,
    debug: true,
});
// Array could be of any type
// tslint:disable-next-line
function asyncForEach(array, callback) {
    return __awaiter(this, void 0, void 0, function* () {
        for (let index = 0; index < array.length; index++) {
            yield callback(array[index], index, array);
        }
    });
}
function getUserIdOrThrow(headers) {
    return __awaiter(this, void 0, void 0, function* () {
        const userId = yield Auth.getUser(headers);
        const userExists = yield Firestore.userExists(userId);
        if (!userExists) {
            throw new Error(`User ${userId} has not created an account, so there are no devices`);
        }
        return userId;
    });
}
app.onSync((body, headers) => __awaiter(this, void 0, void 0, function* () {
    const userId = yield getUserIdOrThrow(headers);
    yield Firestore.setHomegraphEnable(userId, true);
    const devices = yield Firestore.getDevices(userId);
    return {
        requestId: body.requestId,
        payload: {
            agentUserId: userId,
            devices,
        },
    };
}));
app.onQuery((body, headers) => __awaiter(this, void 0, void 0, function* () {
    const userId = yield getUserIdOrThrow(headers);
    const deviceStates = {};
    const { devices } = body.inputs[0].payload;
    yield asyncForEach(devices, (device) => __awaiter(this, void 0, void 0, function* () {
        const states = yield Firestore.getState(userId, device.id);
        deviceStates[device.id] = states;
    }));
    return {
        requestId: body.requestId,
        payload: {
            devices: deviceStates,
        },
    };
}));
app.onExecute((body, headers) => __awaiter(this, void 0, void 0, function* () {
    const userId = yield getUserIdOrThrow(headers);
    const commands = [{
            ids: [],
            status: 'SUCCESS',
            states: {},
        }];
    const { devices, execution } = body.inputs[0].payload.commands[0];
    yield asyncForEach(devices, (device) => __awaiter(this, void 0, void 0, function* () {
        try {
            const states = yield Firestore.execute(userId, device.id, execution[0]);
            commands[0].ids.push(device.id);
            commands[0].states = states;
            // Report state back to Homegraph
            yield app.reportState({
                agentUserId: userId,
                requestId: Math.random().toString(),
                payload: {
                    devices: {
                        states: {
                            [device.id]: states,
                        },
                    },
                },
            });
        }
        catch (e) {
            commands.push({
                ids: [device.id],
                status: 'ERROR',
                errorCode: e.message,
            });
        }
    }));
    return {
        requestId: body.requestId,
        payload: {
            commands,
        },
    };
}));
app.onDisconnect((body, headers) => __awaiter(this, void 0, void 0, function* () {
    const userId = yield getUserIdOrThrow(headers);
    yield Firestore.disconnect(userId);
}));
expressApp.post('/smarthome', app);
expressApp.post('/smarthome/update', (req, res) => __awaiter(this, void 0, void 0, function* () {
    console.log(req.body);
    const { userId, deviceId, name, nickname, states } = req.body;
    try {
        yield Firestore.updateDevice(userId, deviceId, name, nickname, states);
        const reportStateResponse = yield app.reportState({
            agentUserId: userId,
            requestId: Math.random().toString(),
            payload: {
                devices: {
                    states: {
                        [deviceId]: states,
                    },
                },
            },
        });
        console.log(reportStateResponse);
        res.status(200).send('OK');
    }
    catch (e) {
        console.error(e);
        res.status(400).send(`Error reporting state: ${e}`);
    }
}));
expressApp.post('/smarthome/create', (req, res) => __awaiter(this, void 0, void 0, function* () {
    console.log(req.body);
    const { userId, data } = req.body;
    try {
        yield Firestore.addDevice(userId, data);
        yield app.requestSync(userId);
    }
    catch (e) {
        console.error(e);
    }
    finally {
        res.status(200).send('OK');
    }
}));
expressApp.post('/smarthome/delete', (req, res) => __awaiter(this, void 0, void 0, function* () {
    console.log(req.body);
    const { userId, deviceId } = req.body;
    try {
        yield Firestore.deleteDevice(userId, deviceId);
        yield app.requestSync(userId);
    }
    catch (e) {
        console.error(e);
    }
    finally {
        res.status(200).send('OK');
    }
}));
const appPort = process.env.PORT || Config.expressPort;
const expressServer = expressApp.listen(appPort, () => {
    const server = expressServer.address();
    const { address, port } = server;
    console.log(`Smart home server listening at ${address}:${port}`);
    if (Config.useNgrok) {
        ngrok.connect(Config.expressPort, (err, url) => {
            if (err) {
                console.error('Ngrok was unable to start');
                console.error(err);
                process.exit();
            }
            console.log('');
            console.log('COPY & PASTE NGROK URL BELOW');
            console.log(url);
            console.log('');
            console.log('=====');
            console.log('Visit the Actions on Google console at http://console.actions.google.com');
            console.log('Replace the webhook URL in the Actions section with:');
            console.log('    ' + url + '/smarthome');
            console.log('');
            console.log('In the console, set the Authorization URL to:');
            console.log('    ' + url + '/fakeauth');
            console.log('');
            console.log('Then set the Token URL to:');
            console.log('    ' + url + '/faketoken');
            console.log('');
            console.log('Finally press the \'TEST DRAFT\' button');
        });
    }
});
//# sourceMappingURL=index.js.map