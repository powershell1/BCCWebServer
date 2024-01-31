const express = require('express');
const crypto = require("crypto");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
// const bodyParser = require('body-parser');

const client = new MongoClient(process.env.SRV, {
	serverApi: {
		version: ServerApiVersion.v1,
		strict: true,
		deprecationErrors: true,
	}
});

client.connect();

var microcontrollerConnected = [];

const app = express();
// app.use(bodyParser);
app.use(require('body-parser').urlencoded({ extended: false }));
require('express-ws')(app);

async function sessionGet(session) {
	const dbCollection = client.db("Userdata").collection("Infomation");
	return await dbCollection.findOne({ session: session });
}

async function devicesGet(deviceId) {
	const dbCollection = client.db("IoT").collection("IoTList");
	const object = new ObjectId(deviceId);
	return await dbCollection.findOne({ _id: object });
}

app.get("/", (req, res) => {
	res.send("Hello World!");
});

app.get("/ping", (req, res) => {
	res.send("pong");
});

app.ws("/ping", (ws, req) => {});

app.ws("/api/microcontroller", async (ws, req) => {
	const serial = req.query.serial;
	const password = req.query.password;
	if (serial == null || password == null) {
		ws.send(JSON.stringify({
			"headers": "error",
			"body": "Missing serial or password"
		}));
		ws.close();
		return;
	}
	const isThere = microcontrollerConnected.find(element => element.serial == serial);
	if (isThere != undefined) {
		ws.send(JSON.stringify({
			"headers": "error",
			"body": "Already connected"
		}));
		ws.close();
		return;
	}
	const device = await devicesGet(serial);
	if (device == null) {
		ws.send(JSON.stringify({
			"headers": "error",
			"body": "Device not found"
		}));
		ws.close();
		return;
	}
	const sha256Hasher = crypto.createHmac("sha256", process.env.HASH_SECRET);
	const hash = sha256Hasher.update(password).digest("hex");
	if (device.password != hash) {
		ws.send(JSON.stringify({
			"headers": "error",
			"body": "Wrong password"
		}));
		ws.close();
		return;
	}
	microcontrollerConnected.push({
		"serial": serial,
		"paired": device.paired,
		"ws": ws
	});
		ws.on("message", (msg) => {
		ws.send(JSON.stringify({
			"headers": "ready"
		}));
		/*
				var decodedJSON = JSON.parse(msg);
				if (decodedJSON.headers == 'temp_ping') {
								console.log(decodedJSON.body);
				}
				console.log(decodedJSON);
		*/
		});
		ws.on("close", () => {
		microcontrollerConnected.splice(microcontrollerConnected.findIndex(element => element.serial == serial), 1);
		});
	// ws.send("Hello World!");;
});

app.post('/api/login', async (req, res) => {
	const username = req.body.username;
	const password = req.body.password;
	const sha256Hasher = crypto.createHmac("sha256", process.env.HASH_SECRET);
	const hash = sha256Hasher.update(password).digest("hex");
	const dbCollection = client.db("Userdata").collection("Infomation");
	var getData = await dbCollection.findOne({ username: username, password: hash });
	if (getData == null) {
		getData = await dbCollection.findOne({ email: username, password: hash });
	}
	if (getData == null) {
		res.send({
			"status": 401,
			"session": ""
		});
		return;
	}
	// console.log(getData);
	res.send({
		"status": 200,
		"session": getData.session
	});
});

app.post('/api/session', async (req, res) => {
	const session = req.body.session;
	const data = await sessionGet(session);
	if (data == null) {
				return res.send({
						"status": 401,
			"username": "",
			"email": ""
				});
		}
		return res.send({
				"status": 200,
		"username": data.username,
		"email": data.email
		});
});

app.post('/api/devices/:serial', async (req, res) => {
	const serial = req.params.serial;
	const session = req.body.session;
	if (session == null) {
		return res.send({
			"status": 401,
			"message": "Missing session"
		});
	}
	const microcontrollerSocket = microcontrollerConnected.find(element => element.serial == serial);
	if (microcontrollerSocket == undefined) {
		return res.send({
			"status": 401,
			"message": "Device not connected"
		});
	}
	if (microcontrollerSocket.paired != session) {
		return res.send({
			"status": 401,
			"message": "Device not paired"
		});
	}
	res.send({
		"status": 200,
		"message": "Success"
	});
});

app.post('/api/devices', async (req, res) => {
	const session = req.body.session;
	if (session == null) {
		return res.send({
			"status": 401,
			"devices": []
		});
	}
	const datas = await sessionGet(session);
	if (datas == null) {
				return res.send({
						"status": 401,
			"devices": []
				});
		}
	const returnDevices = [];
	// console.log(microcontrollerConnected);
	for (data in datas.deviceList) {
		const device = await devicesGet(datas.deviceList[data]);
		if (device == null) {
			continue;
		}
		returnDevices.push({
			name: device.name,
			serial: datas.deviceList[data],
			connected: microcontrollerConnected.find(element => element.serial == datas.deviceList[data]) != undefined
		});
	}
	return res.send({
		"status": 200,
		"devices": returnDevices
	});
});

app.post('/api/register', async (req, res) => {});

app.post('/api/verify', async (req, res) => {});

app.post('/api/add_device', async (req, res) => {});

app.ws('/api/test', (ws, res) => {
	var i = 0;
	ws.on('message', (msg) => {
		console.log(msg);
	});
	setInterval(() => {
		ws.send((i%2).toString());
		i++;
	}, 1000);
});


// Device Controller

app.post('/api/led/:serial/:status', async (req, res) => {
	const serial = req.params.serial;
	const status = req.params.status;
	const session = req.body.session;
	if (session == null) {
		return res.send({
			"status": 401,
			"message": "Missing session"
		});
	}
	const microcontrollerSocket = microcontrollerConnected.find(element => element.serial == serial);
	if (microcontrollerSocket == undefined) {
		return res.send({
			"status": 401,
			"message": "Device not connected"
		});
	}
	if (microcontrollerSocket.paired != session) {
		return res.send({
			"status": 401,
			"message": "Device not paired"
		});
	}
	microcontrollerSocket.ws.send(status);
	res.send({
		"status": 200,
		"message": "Success"
	});
});



app.listen(80, () => {
	console.log('server started');
});