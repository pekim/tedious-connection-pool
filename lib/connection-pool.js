'use strict';
var Connection = require('tedious').Connection;
var EventEmitter = require('events').EventEmitter;
var util = require('util');

Connection.prototype.release = function() {
    this.pool.release(this);
};

var PENDING = 0;
var FREE = 1;
var USED = 2;
var RETRY = 3;

function ConnectionPool(poolConfig, connectionConfig) {
    this.connections = [];
    this.waitingForConnection = [];
    this.connectionConfig = connectionConfig;

    this.max = poolConfig.max || 50;
    this.min = poolConfig.min || 10;
    this.idleTimeout = poolConfig.idleTimeout || poolConfig.idletimeoutMillis || 30000; //5 min
    this.retryDelay = poolConfig.retryDelay || 5000;
    this.log = poolConfig.log;

    setTimeout(fill.bind(this), 4);
}

util.inherits(ConnectionPool, EventEmitter);

function createConnection(pooled) {
    if (this.connections === undefined) //pool has been drained
        return;

    var self = this;
    var connection = new Connection(this.connectionConfig);
    connection.pool = this;
    if (!pooled)
        pooled = {
            con: connection,
            status: PENDING
        };
    this.connections.push(pooled);

    var handleError = function(err) {
        self.emit('error', err);

        pooled.status = RETRY;
        pooled.con = undefined;
        connection.removeAllListeners('end');
        connection.close();

        setTimeout(createConnection.bind(self, pooled), self.retryDelay);
    };

    connection.on('connect', function (err) {
        if (self.connections === undefined) { //pool has been drained
            connection.close();
            return;
        }

        if (err) {
            handleError(err);
            return;
        }

        var callback = self.waitingForConnection.shift();
        if (callback !== undefined)
            setUsed.call(this, pooled, callback);
        else
            setFree.call(this, pooled);
    });

    connection.on('error', handleError);

    connection.on('end', function () {
        if (self.connections === undefined) //pool has been drained
            return;

        for (var i = self.connections.length - 1; i >= 0; i--) {
            if (self.connections[i].con === connection) {
                self.connections.splice(i, 1);
                fill.call(self);
                return;
            }
        }
    });
}

function fill() {
    if (this.connections === undefined) //pool has been drained
        return;

    var available = 0;
    for (var i = this.connections.length - 1; i >= 0; i--) {
        if (this.connections[i].status !== USED) {
            available++;
        }
    }

    var amount = Math.min(
        this.max - this.connections.length, //max that can be created
        this.waitingForConnection.length - available); //how many are needed, minus how many are available

    amount = Math.max(
        this.min - this.connections.length, //amount to create to reach min
        amount);

    for (i = 0; i < amount; i++) {
        createConnection.call(this);
    }
}

ConnectionPool.prototype.acquire = function (callback) {
    if (this.connections === undefined) //pool has been drained
        return;

    var free;

    //look for free connection
    var l = this.connections.length;
    for (var i = 0; i < l; i++) {
        var pooled = this.connections[i];

        if (pooled.status === FREE) {
            free = pooled;
            break;
        }
    }

    if (free === undefined) { //no valid connection found
        this.waitingForConnection.push(callback);
        fill.call(this);
    } else {
        setUsed.call(this, free, callback);
    }
};

function setUsed(pooled, callback) {
    pooled.status = USED;
    if (pooled.timeout)
        clearTimeout(pooled.timeout);
    callback(pooled.con);
}

function setFree(pooled) {
    pooled.status = FREE;
    pooled.timeout = setTimeout(function() {
        pooled.con.close();
    }, this.idleTimeout);
}

ConnectionPool.prototype.release = function(connection) {
    if (this.connections === undefined) //pool has been drained
        return;

    var callback = this.waitingForConnection.shift();

    if (callback !== undefined) {
        callback(connection);
    } else {
        for (var i = this.connections.length - 1; i >= 0; i--) {
            var pooled = this.connections[i];
            if (pooled.con === connection) {
                setFree.call(this, pooled);
                break;
            }
        }
    }
};

ConnectionPool.prototype.drain = function () {
    if (this.connections === undefined) //pool has been drained
        return;

    for (var i = this.connections.length - 1; i >= 0; i--)
        this.connections[i].con.close();

    this.connections = undefined;
    this.waitingForConnection = undefined;
};

module.exports = ConnectionPool;
