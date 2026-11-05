// A desktop process may outlive the terminal that launched it. Ignore only a
// disconnected logging pipe; other stream errors must still surface.
function protectOutput(stream) {
  if (!stream) return;
  stream.on('error', error => {
    if (error.code !== 'EPIPE') throw error;
  });
}
function install() {
  protectOutput(process.stdout);
  protectOutput(process.stderr);
}
module.exports = { install, protectOutput };
