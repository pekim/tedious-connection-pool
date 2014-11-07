'use strict';
var Connection = require('tedious').Connection;
var EventEmitter = require('events').EventEmitter;
var util = require('util');

Connection.prototype.release = function() {
    this.pool.release(this);
};

function ConnectionPool(poolConfig, connectionConfig) {
    this.free = [];
    this.used = [];
    this.pending = [];
    this.waitingForConnection = [];
    this.connectionConfig = connectionConfig;

    this.max = poolConfig.max || 50;
    this.min = poolConfig.min || 10;
    this.idleTimeout = poolConfig.idleTimeout || poolConfig.idletimeoutMillis || 30000; //5 min
    this.retryDelay = poolConfig.retryDelay || 30;
    this.log = poolConfig.log;

    setTimeout(fill.bind(this), 4);
}

util.inherits(ConnectionPool, EventEmitter);

function delayCreateConnection() {
    if (this.pending === undefined) //pool has been drained
        return;

    var self = this;
    var placeholder = {};
    this.pending.push(placeholder);

    setTimeout(function() {
        var i = self.pending.indexOf(placeholder);
        self.pending.splice(i, 1);
        createConnection.call(self);
    }, this.retryDelay);
}

function createConnection() {
    var self = this;
    var connection = new Connection(this.connectionConfig);
    connection.pool = this;
    this.pending.push(connection);

    connection.on('connect', function (err) {
        if (self.pending === undefined) { //pool has been drained
            connection.close();
            return;
        }

        var i = self.pending.indexOf(connection);
        if (i === -1)
            throw new Error('connection not in pool');

        self.pending.splice(i, 1);

        if (err) {
            if (EventEmitter.listenerCount(self, 'error'))
                self.emit('error', err);
            connection.removeAllListeners('end');
            connection.close();
            delayCreateConnection.call(self);
            return;
        }

        connection.this = this;

        self.release(connection);
    });

    connection.on('end', function () {
        if (self.pending === undefined) //pool has been drained
            return;

        var i = self.used.indexOf(connection);
        if (i > -1) {
            self.used.splice(i, 1);
        } else {
            i = self.free.indexOf(connection);
            if (i > -1)
                self.free.splice(i, 1);
        }

        fill.call(self);
    });
}

function fill() {
    if (this.free === undefined) //pool has been drained
        return;

    var total = this.pending.length + this.free.length + this.used.length;

    var amount = Math.min(
        this.max - total, //max that can be created
        this.waitingForConnection.length - this.pending.length - this.free.length); //how many are needed, minus how many are available

    amount = Math.max(
        this.min - total, //amount to create to reach min
        amount);

    for (var i = 0; i < amount; i++) {
        createConnection.call(this);
    }
}

ConnectionPool.prototype.acquire = function (callback) {
    if (this.pending === undefined) //pool has been drained
        return;

    var connection;

    //look for valid free connection
    while (true) {
        connection = this.free.shift();

        if (connection === undefined) { //no valid connection found
            this.waitingForConnection.push(callback);
            fill.call(this);
            return;
        }

        if (!connection.closed) //remove closed connections
            break;
    }

    this.used.push(connection);
    callback(connection);
};

ConnectionPool.prototype.release = function(connection) {
    if (this.pending === undefined) //pool has been drained
        return;

    var callback = this.waitingForConnection.shift();
    if (callback !== undefined) {
        callback(connection);
    } else {
        var i = this.used.indexOf(connection);
        if (i > -1)
            this.used.splice(i, 1);

        this.free.push(connection);
    }
};

ConnectionPool.prototype.drain = function () {
    if (this.pending === undefined) //pool has been drained
        return;

    var i;

    for (i = this.free.length - 1; i >= 0; i--)
        this.free[i].close();

    for (i = this.free.length - 1; i >= 0; i--)
        this.used[i].close();

    this.free = undefined;
    this.used = undefined;
    this.pending = undefined;
    this.waitingForConnection = undefined;
};

module.exports = ConnectionPool;
