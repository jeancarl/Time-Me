// Filename: app.js

var NEXMO_API_KEY = '';
var NEXMO_API_SECRET = '';
var BRAND_NAME = 'Time Me';
var START_COMMAND = 'begin';
var FINISH_COMMAND = 'finish';
var MONGODB_ADDRESS = 'mongodb://127.0.0.1:27017/test';
var SESSION_SECRET = '';
var PORT = 8080;

var express = require('express');
var bodyParser = require('body-parser');
var request = require('request');
var url = require('url');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var MongoStore = require('connect-mongo')(session);
var mongoose = require('mongoose');
mongoose.connect(MONGODB_ADDRESS);

var app = express();
app.use(cookieParser());
app.use(session({
  secret: SESSION_SECRET,
  store: new MongoStore({ mongooseConnection: mongoose.connection })
}));
app.listen(PORT);
app.use(bodyParser.json());

var Task = mongoose.model("TimeTest6", {
  number: String,
  task: String,
  starttime: Number,
  endtime: Number
});

app.get('/api/verify', function(req, res) {
  var query = url.parse(req.url, true).query;
  query.number = query.number;

  request.get('https://api.nexmo.com/verify/json?number='+query.number+'&brand='+encodeURIComponent(BRAND_NAME)+'&api_key='+NEXMO_API_KEY+'&api_secret='+NEXMO_API_SECRET, function(err, response) {
    if(err) {
      res.send({error: 'Stale request id'});
      return;
    }

    var js = JSON.parse(response.body);
    if(js.error_text) {
      res.send({error: js.error_text});
      return;
    }

    req.session.unverified_number = query.number;
    req.session.request_id = js.request_id;

    res.send({requestid: js.request_id});
  });
});

app.post('/api/check', function(req, res) {
  var query = url.parse(req.url, true).query;
  var requestId = query.requestid;
  var code = query.code;

  if(req.session.request_id != requestId) {
    res.send({error: 'Stale request id'});
    return;
  }

  request.get('https://api.nexmo.com/verify/check/json?request_id='+requestId+'&code='+code+'&api_key='+NEXMO_API_KEY+'&api_secret='+NEXMO_API_SECRET, function(err, response) {
    if(err) {
      res.send({error: 'Invalid code'});
      return;
    }

    var js = JSON.parse(response.body);
    if(js.error_text) {
      res.send({error: js.error_text}
        );
      return;
    }
    
    if(js.status == '0') {
      req.session.number = req.session.unverified_number;
      res.send({number: req.session.number});
    } else {
      res.send({error: 'Invalid code'});
    }
  });
});

app.get('/api/me', function(req, res) {
  if(req.session.number) {    
    res.send({number: req.session.number});
  } else {
    res.send({error: 'Not validated'});  
  }
});

app.get('/api/nexmo', function(req, res) {
  var query = url.parse(req.url, true).query;
  var timeNow = new Date();

  if(query.text.substring(0, START_COMMAND.length).toLowerCase() == START_COMMAND) {
    Task.create({
      number: query.msisdn,
      task: query.text.substring(START_COMMAND.length+1),
      starttime: timeNow.getTime(),
      endtime: 0
    }, function(err, doc) {
      if(err || !doc) {
        console.log(err);
        return;
      }
        
      sendMessage(query.to, query.msisdn, 'Starting '+doc.task, function(err, response) {
        if(err)
          console.log(err);
      });
    });

    res.send('success');

    return;
  }

  if(query.text.substring(0, FINISH_COMMAND.length).toLowerCase() == FINISH_COMMAND) {
    Task.findOne({
      number: query.msisdn,
      task: query.text.substring(FINISH_COMMAND.length+1),
      endtime: 0
    }, function(err, doc) {
      if(err || !doc) {
        sendMessage(query.to, query.msisdn, 'I could not find a task to stop by that name.', function(err, response) {
          if(err)
            console.log(err);
        });
        return;
      }

      Task.update({_id: doc._id}, {endtime: timeNow.getTime()}, function(err, numAffected) {

      });

      sendMessage(query.to, query.msisdn, 'Finished '+doc.task, function(err, response) {
        if(err)
          console.log(err);        
      });
    });    

    res.send('success');
    return;
  }  

  Task.find({
    number: query.msisdn,
    task: query.text,
  }).sort({_id: -1}).limit(1).exec(function(err, doc) {
    if(err || doc.length == 0) {
      sendMessage(query.to, query.msisdn, 'I could not find a task by that name.', function(err, response) {
        if(err)
          console.log(err);        
      });

      return;
    }

    var startTime = new Date();
    startTime.setTime(doc[0].starttime);
    var message = 'Started at '+startTime.format('m/dd HH:MM');

    if(doc[0].endtime > 0) {
      var endTime = new Date();
      endTime.setTime(doc[0].endtime);
      message += ' to '+endTime.format('m/dd HH:MM');
    }

    var timeNow = new Date();
    var elapsedTimeSeconds = Math.floor(((endTime > 0 ? endTime : timeNow.getTime())-doc[0].starttime)/1000);
  
    var pad = function(num, size) {
      var s = num+'';
      while (s.length < size) s = '0' + s;
      return s;
    }    

    message += ' Elapsed: '+pad(Math.floor(elapsedTimeSeconds/86400),2)+':'+
                pad(Math.floor(elapsedTimeSeconds/3600),2)+':'+
                pad(Math.floor(elapsedTimeSeconds/60),2)+':'+
                pad((elapsedTimeSeconds%60),2);
  
    sendMessage(query.to, query.msisdn, message, function(err, response) {
      if(err)
        console.log(err);        
    });
  });    

  res.send('success');
});

app.get('/api/tasks', function(req, res) {
  Task.find({number: req.session.number}, function(err, tasks) {
    if(err) {
      console.log(err);
      return;
    }

    var results = [];
    var timeNow = new Date();

    for(var i in tasks) {
      results.push({
        task: tasks[i].task, 
        starttime: tasks[i].starttime, 
        endtime: tasks[i].endtime,
        elapsed: (tasks[i].endtime == 0 ? timeNow.getTime() : tasks[i].endtime)-tasks[i].starttime
      });
    }

    res.send(results);
  });
});

app.get('/api/logout', function(req, res) {
  req.session.destroy();

  res.status(200);
  res.send();
})

app.use(express.static(__dirname + '/public'));

console.log('Application listening on port '+PORT);

function sendMessage(from, to, message, callback) {
  request.get('https://rest.nexmo.com/sms/json?api_key='+NEXMO_API_KEY+'&api_secret='+NEXMO_API_SECRET+'&from='+from+'&to='+to+'&text='+message, function(err, response) {
    callback(err, response);
  });  
}

/*
 * Date Format 1.2.3
 * (c) 2007-2009 Steven Levithan <stevenlevithan.com>
 * MIT license
 *
 * Includes enhancements by Scott Trenda <scott.trenda.net>
 * and Kris Kowal <cixar.com/~kris.kowal/>
 *
 * Accepts a date, a mask, or a date and a mask.
 * Returns a formatted version of the given date.
 * The date defaults to the current date/time.
 * The mask defaults to dateFormat.masks.default.
 */

var dateFormat = function () {
    var token = /d{1,4}|m{1,4}|yy(?:yy)?|([HhMsTt])\1?|[LloSZ]|"[^"]*"|'[^']*'/g,
        timezone = /\b(?:[PMCEA][SDP]T|(?:Pacific|Mountain|Central|Eastern|Atlantic) (?:Standard|Daylight|Prevailing) Time|(?:GMT|UTC)(?:[-+]\d{4})?)\b/g,
        timezoneClip = /[^-+\dA-Z]/g,
        pad = function (val, len) {
            val = String(val);
            len = len || 2;
            while (val.length < len) val = "0" + val;
            return val;
        };

    // Regexes and supporting functions are cached through closure
    return function (date, mask, utc) {
        var dF = dateFormat;

        // You can't provide utc if you skip other args (use the "UTC:" mask prefix)
        if (arguments.length == 1 && Object.prototype.toString.call(date) == "[object String]" && !/\d/.test(date)) {
            mask = date;
            date = undefined;
        }

        // Passing date through Date applies Date.parse, if necessary
        date = date ? new Date(date) : new Date;
        if (isNaN(date)) throw SyntaxError("invalid date");

        mask = String(dF.masks[mask] || mask || dF.masks["default"]);

        // Allow setting the utc argument via the mask
        if (mask.slice(0, 4) == "UTC:") {
            mask = mask.slice(4);
            utc = true;
        }

        var _ = utc ? "getUTC" : "get",
            d = date[_ + "Date"](),
            D = date[_ + "Day"](),
            m = date[_ + "Month"](),
            y = date[_ + "FullYear"](),
            H = date[_ + "Hours"](),
            M = date[_ + "Minutes"](),
            s = date[_ + "Seconds"](),
            L = date[_ + "Milliseconds"](),
            o = utc ? 0 : date.getTimezoneOffset(),
            flags = {
                d:    d,
                dd:   pad(d),
                ddd:  dF.i18n.dayNames[D],
                dddd: dF.i18n.dayNames[D + 7],
                m:    m + 1,
                mm:   pad(m + 1),
                mmm:  dF.i18n.monthNames[m],
                mmmm: dF.i18n.monthNames[m + 12],
                yy:   String(y).slice(2),
                yyyy: y,
                h:    H % 12 || 12,
                hh:   pad(H % 12 || 12),
                H:    H,
                HH:   pad(H),
                M:    M,
                MM:   pad(M),
                s:    s,
                ss:   pad(s),
                l:    pad(L, 3),
                L:    pad(L > 99 ? Math.round(L / 10) : L),
                t:    H < 12 ? "a"  : "p",
                tt:   H < 12 ? "am" : "pm",
                T:    H < 12 ? "A"  : "P",
                TT:   H < 12 ? "AM" : "PM",
                Z:    utc ? "UTC" : (String(date).match(timezone) || [""]).pop().replace(timezoneClip, ""),
                o:    (o > 0 ? "-" : "+") + pad(Math.floor(Math.abs(o) / 60) * 100 + Math.abs(o) % 60, 4),
                S:    ["th", "st", "nd", "rd"][d % 10 > 3 ? 0 : (d % 100 - d % 10 != 10) * d % 10]
            };

        return mask.replace(token, function ($0) {
            return $0 in flags ? flags[$0] : $0.slice(1, $0.length - 1);
        });
    };
}();

// Some common format strings
dateFormat.masks = {
    "default":      "ddd mmm dd yyyy HH:MM:ss",
    shortDate:      "m/d/yy",
    mediumDate:     "mmm d, yyyy",
    longDate:       "mmmm d, yyyy",
    fullDate:       "dddd, mmmm d, yyyy",
    shortTime:      "h:MM TT",
    mediumTime:     "h:MM:ss TT",
    longTime:       "h:MM:ss TT Z",
    isoDate:        "yyyy-mm-dd",
    isoTime:        "HH:MM:ss",
    isoDateTime:    "yyyy-mm-dd'T'HH:MM:ss",
    isoUtcDateTime: "UTC:yyyy-mm-dd'T'HH:MM:ss'Z'"
};

// Internationalization strings
dateFormat.i18n = {
    dayNames: [
        "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
        "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
    ],
    monthNames: [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
        "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"
    ]
};

// For convenience...
Date.prototype.format = function (mask, utc) {
    return dateFormat(this, mask, utc);
};