'use strict';

/**
 * Pterodactyl - Daemon
 * Copyright (c) 2015 - 2016 Dane Everitt <dane@daneeveritt.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
const rfr = require('rfr');
const Async = require('async');
const Dockerode = require('dockerode');
const Fs = require('fs-extra');
const Path = require('path');

const SFTPController = rfr('src/controllers/sftp.js');
const ConfigHelper = rfr('src/helpers/config.js');
const Log = rfr('src/helpers/logger.js');
const Status = rfr('src/helpers/status.js');

const Config = new ConfigHelper();
const SFTP = new SFTPController();
const DockerController = new Dockerode({
    socketPath: Config.get('docker.socket', '/var/run/docker.sock'),
});

class Delete {
    constructor(json) {
        this.json = json;
        this.log = Log.child({ server: this.json.uuid });
    }

    delete(next) {
        Async.auto({
            // Clear the 'Servers' object of the specific server
            clear_object: callback => {
                this.log.debug('Clearing servers object...');
                const Servers = rfr('src/helpers/initialize.js').Servers;

                // Prevent crash detection
                Servers[this.json.uuid].setStatus(Status.OFF);
                delete Servers[this.json.uuid];
                return callback();
            },
            // Delete the container (kills if running)
            delete_container: ['clear_object', (r, callback) => {
                this.log.debug('Attempting to remove container...');
                const container = DockerController.getContainer(this.json.container.id);
                container.remove({ v: true, force: true }, err => {
                    if (!err) this.log.debug('Removed container.');
                    return callback(err);
                });
            }],
            // Delete the configuration files for this server
            delete_config: ['clear_object', (r, callback) => {
                this.log.debug('Attempting to remove configuration files...');
                Fs.remove(Path.join('./config/servers', this.json.uuid), err => {
                    if (!err) this.log.debug('Removed configuration folder.');
                    return callback(err);
                });
            }],
            // Delete the SFTP user and files.
            delete_sftp: ['clear_object', (r, callback) => {
                this.log.debug('Attempting to remove SFTP user...');
                SFTP.delete(this.json.user, err => {
                    if (!err) this.log.debug('Removed SFTP user.');
                    return callback(err);
                });
            }],
            delete_folder: ['delete_sftp', (r, callback) => {
                Fs.remove(Path.join(Config.get('sftp.path', '/srv/daemon-data'), this.json.user), callback);
            }],
        }, err => {
            if (err) Log.fatal(err);
            this.log.info('Server deleted.');
            return next(err);
        });
    }
}

module.exports = Delete;
