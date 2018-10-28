const child_process = require("child_process");

var vm_proc, ssh_args, cockpit_url;

// poor man's polling implementation
function waitpid(pid) {
    return new Promise((resolve, reject) => {
        function check() {
            try {
                process.kill(pid);
                // succeeds → process still exists, poll again
                setTimeout(check, 50);
            } catch(e) {
                // ESRCH → process is gone
                if (e.code == "ESRCH")
                    resolve(null);
                else
                    throw e;
            }
        }

        check();
    });
}

module.exports = (on, config) => {
    on("task", {
        startVM: image => {
            if (!image)
                image = process.env.TEST_OS || "fedora-29";
            // already running? happens when cypress restarts the test after visiting a baseUrl the first time
            if (vm_proc)
                return cockpit_url;

            // no, start a new VM
            return new Promise((resolve, reject) => {
                let proc = child_process.spawn("bots/machine/testvm.py", [image],
                                               { stdio: ["pipe", "pipe", "inherit"] });
                let buf = "";
                vm_proc = proc.pid;
                proc.stdout.on("data", data => {
                    buf += data.toString();
                    if (buf.indexOf("\nRUNNING\n") > 0) {
                        let lines = buf.split("\n");
                        ssh_args = lines[0].split(" ").slice(1);
                        cockpit_url = lines[1];
                        resolve(cockpit_url);
                    }
                });
                proc.on("error", err => reject (err));
            });
        },

        stopVM: () => {
            process.kill(vm_proc);
            let p = waitpid(vm_proc);
            p.then(() => { vm_proc = null; });
            return p;
        },

        runVM: command => {
            res = child_process.spawnSync("ssh", ssh_args.concat(command),
                                          { stdio: ["pipe", "pipe", "inherit"], encoding: "UTF-8" });
            if (res.status)
                throw new Error(`Command "${command} failed with code ${res.status}`);
            return res.stdout;
        }
    });
}
