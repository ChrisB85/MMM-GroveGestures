const path = require("path")
const exec = require("child_process").exec
const {PythonShell} = require("python-shell")
const {spawn} = require('child_process');

var NodeHelper = require('node_helper')

module.exports = NodeHelper.create({

  start: function() {
    this.config = {}
    this.gestureSequence = ""
    this.commandTimer = null
    this.shell = null
  },

  stop: function() {
    this.log("[GESTURE] Finishing...")
    if (this.shell) {
      this.shell.end()
    }
  },

  socketNotificationReceived: function (noti, payload) {
    switch (noti) {
      case "INIT":
        this.job(payload)
        break
      case "SHELLEXEC":
        exec(payload, (e,so,se)=>{
          this.log("[GESTURE] Shell command: " + payload)
          if (e) console.log(e)
        })
        break
    }
  },

  log : function(obj) {
    if (this.config.verbose) {
      console.log(obj)
    }
  },

  job: function(config) {
    this.config = config;
    const map = this.config.gestureMapFromTo;
    const py = path.resolve(__dirname, "py", "gesture_print.py");

    // zamiast PythonShell — użyjemy child_process
    const args = ['-u', py];
    const proc = spawn('sudo', [config.pythonPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    proc.stdout.on('data', data => {
      const message = data.toString().trim();
      this.log("[GESTURE] ORIGIN:" + message);
      const gesture = map.hasOwnProperty(message) ? map[message] : null;
      if (gesture) this.gestureProcess(gesture);
    });

    proc.stderr.on('data', data => {
      const msg = data.toString();
      if (!msg.includes('KeyboardInterrupt')) this.log(msg);
      else this.log("Keyboard Interrupted");
    });

    proc.on('close', code => {
      this.log(`[GESTURE] Python script zakończony (kod ${code}). Restart za 0.5s.`);
      setTimeout(() => this.job(config), 500);
    });
  },

  gestureProcess: function(gesture) {
    clearTimeout(this.commandTimer)
    this.commandTimer = null
    if (gesture == this.config.cancelGesture) {
      this.log("[GESTURE] Cancel: " + this.gestureSequence)
      this.sendSocketNotification("CANCEL", {
        last: gesture,
        sequence: this.gestureSequence,
      })
      this.gestureSequence = ""
      clearTimeout(this.commandTimer)
    } else {
      this.gestureSequence += (this.gestureSequence) ? ("-" + gesture) : gesture
      this.log("[GESTURE] Ongoing: " + this.gestureSequence)
      this.sendSocketNotification("ONGOING", {
        last:gesture,
        sequence: this.gestureSequence,
      })
      this.log("[GESTURE] Timer reset")
      this.commandTimer = setTimeout(()=>{
        this.log("[GESTURE] Finish: " + this.gestureSequence)
        this.sendSocketNotification("FINISH", {
          last:gesture,
          sequence: this.gestureSequence,
        })
        this.gestureSequence = ""
      }, this.config.recognitionTimeout)

    }
  },
})
