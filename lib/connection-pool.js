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
    this.idleTimeout = poolConfig.idleTimeout || poolConfig.idletimeoutMillis || 300000; //5 min
    this.retryDelay = poolConfig.retryDelay || 5000;

    if (poolConfig.log) {
        if (Object.prototype.toString.call(poolConfig.log) == '[object Function]')
            this.log = poolConfig.log;
        else {
            this.log = function(text) {
                console.log('Tedious-Connection-Pool: ' + text);
            };
        }
    } else {
        this.log = function() {};
    }
    
    this.drained = false;

    setTimeout(fill.bind(this), 4);
}

util.inherits(ConnectionPool, EventEmitter);

function createConnection(pooled) {
    if (this.drained) //pool has been drained
        return;

    var self = this;

    this.log('creating connection');
    var connection = new Connection(this.connectionConfig);
    connection.pool = this;
    if (pooled) {
        pooled.con = connection;
        pooled.status = PENDING;
    } else {
        pooled = {
            con: connection,
            status: PENDING
        };

        this.connections.push(pooled);
    }

    var handleError = function(err) {
        self.log('connection closing because of error');
        self.emit('error', err);

        pooled.status = RETRY;
        pooled.con = undefined;
        connection.removeAllListeners('end');
        connection.close();

        setTimeout(createConnection.bind(self, pooled), self.retryDelay);
    };

    connection.on('connect', function (err) {
        self.log('connection connected');
        if (self.drained) { //pool has been drained
            self.log('connection closing because pool is drained');
            connection.close();
            return;
        }

        if (err) {
            handleError(err);
            return;
        }

        var callback = self.waitingForConnection.shift();
        if (callback !== undefined)
            setUsed.call(self, pooled, callback);
        else
            setFree.call(self, pooled);
    });

    connection.on('error', handleError);

    connection.on('end', function () {
        self.log('connection ended');
        if (self.drained) //pool has been drained
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
    if (this.drained) //pool has been drained
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

    if (amount > 0)
        this.log('filling ' + amount);

    for (i = 0; i < amount; i++) {
        createConnection.call(this);
    }
}

ConnectionPool.prototype.acquire = function (callback) {
    if (this.drained) //pool has been drained
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
    var self = this;

    pooled.status = FREE;
    pooled.timeout = setTimeout(function() {
        self.log('closing idle connection');
        pooled.con.close();
    }, this.idleTimeout);
}

ConnectionPool.prototype.release = function(connection) {
    if (this.drained) //pool has been drained
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
    this.log('draining pool');
    if (this.drained) //pool has been drained
        return;

    this.drained = true;

    for (var i = this.connections.length - 1; i >= 0; i--)
        this.connections[i].con.close();

    this.connections = null;
    this.waitingForConnection = null;
};

module.exports = ConnectionPool;
