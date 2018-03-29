var request = require('request');
var express = require('express');
var app = express();

app.listen(process.env.BOTPORT, () => {
    console.log('We are live on port ' + process.env.BOTPORT);
});

app.get( '/', function ( req, res ) {
    res.send( 'Statusbot is live' );
} );

var CronJob = require('cron').CronJob;
new CronJob('*/5 * * * *', function() {
    console.log('Executing CRON request (keeping the Salesforce token alive)');
    var requestUrl = "https://status-backend.stage.eu.magalog.net/status/braunhamburg";
    request(requestUrl, function (error, response, body) {
        if (!error) {
            console.log('Request executed');
        }
    });
}, null, true, 'Europe/Berlin');


/**
 * Define a function for initiating a conversation on installation
 * With custom integrations, we don't have a way to find out who installed us, so we can't message them :(
 */

function onInstallation(bot, installer) {
    if (installer) {
        bot.startPrivateConversation({user: installer}, function (err, convo) {
            if (err) {
                console.log(err);
            } else {
                convo.say('I am a bot that has just joined your team');
                convo.say('You must now /invite me to a channel so that I can be of use!');
            }
        });
    }
}

/**
 * Configure the persistence options
 */

var config = {};
if (process.env.MONGOLAB_URI) {
    var BotkitStorage = require('botkit-storage-mongo');
    config = {
        storage: BotkitStorage({mongoUri: process.env.MONGOLAB_URI}),
    };
} else {
    config = {
        json_file_store: ((process.env.TOKEN)?'./db_slack_bot_ci/':'./db_slack_bot_a/'), //use a different name if an app or CI
    };
}

/**
 * Are being run as an app or a custom integration? The initialization will differ, depending
 */

if (process.env.TOKEN || process.env.SLACK_TOKEN) {
    //Treat this as a custom integration
    var customIntegration = require('./lib/custom_integrations');
    var token = (process.env.TOKEN) ? process.env.TOKEN : process.env.SLACK_TOKEN;
    var controller = customIntegration.configure(token, config, onInstallation);
} else if (process.env.CLIENT_ID && process.env.CLIENT_SECRET && process.env.PORT) {
    //Treat this as an app
    var app = require('./lib/apps');
    var controller = app.configure(process.env.PORT, process.env.CLIENT_ID, process.env.CLIENT_SECRET, config, onInstallation);
} else {
    console.log('Error: If this is a custom integration, please specify TOKEN in the environment. If this is an app, please specify CLIENTID, CLIENTSECRET, and PORT in the environment');
    process.exit(1);
}


/**
 * A demonstration for how to handle websocket events. In this case, just log when we have and have not
 * been disconnected from the websocket. In the future, it would be super awesome to be able to specify
 * a reconnect policy, and do reconnections automatically. In the meantime, we aren't going to attempt reconnects,
 * WHICH IS A B0RKED WAY TO HANDLE BEING DISCONNECTED. So we need to fix this.
 *
 * TODO: fixed b0rked reconnect behavior
 */
// Handle events related to the websocket connection to Slack
controller.on('rtm_open', function (bot) {
    console.log('** The RTM api just connected!');
});

controller.on('rtm_close', function (bot) {
    console.log('** The RTM api just closed');
    // you may want to attempt to re-open
});


/**
 * Core bot logic goes here!
 */

controller.on('bot_channel_join', function (bot, message) {
    bot.reply(message, "I'm here!")
});

controller.hears('hello', 'direct_message,mention,direct_mention', function (bot, message) {
    bot.reply(message, 'Hello!');
});

controller.hears('status', 'direct_message,mention,direct_mention', function (bot, message) {
    var messageText = message.text;
    var domainName = messageText.replace('status ', '');

    var requestUrl = "https://status-backend.stage.eu.magalog.net/status/" + domainName;
    console.log(requestUrl);
    request(requestUrl, function (error, response, body) {
        body = JSON.parse(body);

        var respObj = {};
        respObj.text = 'You searched for: ' + domainName
        respObj.attachments = [];

        if (body.length < 1) {
            response = {
            "text": 'You searched for: ' + domainName,
            "attachments": [
                {
                    "title": "Not found",
                    "text": 'We dont have anything similar to ' + domainName + ' in our records',
                },
                ]
            };

        bot.reply(message, response);
        return;
        }

        body.forEach((e)=>{
            var attachment = {};
            attachment.title = e.Name;
            attachment.fields = [];

            fieldObj1 = {
            'title' : 'Magazine URL',
            'value' : e.Magazine_URL__c,
            'short' : true
            }

            fieldObj2 = {
            'title' : 'Magazine Status',
            'value' : e.Status__c,
            'short' : true
            }

            if (fieldObj1.value && fieldObj2.value) {
            attachment.fields.push(fieldObj1);
            attachment.fields.push(fieldObj2);
            respObj.attachments.push(attachment);
            }
        })

        bot.reply(message, respObj);

    });
});
