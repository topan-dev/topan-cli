const Sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
var socket, MainLogger, RoomLogger, inited = false, allowSendInRoom = false;

function textToSafeHtml(text) {
  return text.replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char] || tag));
}

class Logger {
  selector;
  messages;
  constructor(selector) {
    this.selector = selector;
    this.messages = new Array();
  }
  log(message) {
    this.messages.push(message);
    if (!message.startsWith('<p')) message = `<p>${message}</p>`;
    $(this.selector).append(message);
    $(this.selector).scrollTop($(this.selector).prop("scrollHeight"));
  }
  clean() {
    this.messages = new Array();
    $(this.selector).empty();
  }
}

function startConnection() {
  if (inited) socket.send(JSON.stringify({ type: "main", command: "reinit" }));
  else socket.send(JSON.stringify({ type: "main", command: "init" })), inited = true;
}

function getMessage(message) {
  try {
    var messages = JSON.parse(message.data);
    for (var message of messages) {
      if (message.console) {
        console.log(message.console);
        continue;
      }
      if (message.mainlog) {
        MainLogger.log(message.mainlog);
        continue;
      }
      if (message.roomlog) {
        RoomLogger.log(message.roomlog);
        continue;
      }
      if (message.cleanRoomlog) {
        // RoomLogger.clean();
        continue;
      }
      if (message.statusChange) {
        if (message.statusChange == 'allow') allowSendInRoom = true;
        if (message.statusChange == 'notallow') allowSendInRoom = false;
        continue;
      }
      if (message.run) {
        MainLogger.log(`<span class="command-tip">topan-cli></span> ${message.run}`);
        socket.send(JSON.stringify({ type: "main", command: message.run }));
        continue;
      }
      if (message.script) {
        eval(message.script);
        continue;
      }
      if (message.cookie) {
        $.cookie('topan.client.cookie', message.cookie,
          { expires: 100, path: '/', secure: false, raw: false });
        window.location.pathname = '';
        continue;
      }
    }
  }
  catch (e) { console.log(e); }
}

function closeSocket() {
  MainLogger.log(`<span class="command-error">连接已中断，3 秒后尝试重新连接。</span>`)
  setTimeout(() => {
    socket = new WebSocket(`ws://${window.location.host}/ws`);
    socket.onopen = startConnection;
    socket.onmessage = getMessage;
    socket.onclose = closeSocket;
  }, 3000);
}

$(document).ready(() => {
  MainLogger = new Logger('.cli-main');
  RoomLogger = new Logger('.cli-room');

  socket = new WebSocket(`ws://${window.location.host}/ws`);
  socket.onopen = startConnection;
  socket.onmessage = getMessage;
  socket.onclose = closeSocket;

  $('.input-main').keypress(event => {
    if ((event.keyCode ? event.keyCode : event.which) == '13') {
      if ($('.input-main').val()) {
        var command = $('.input-main').val();
        if (!(/^[a-z]+? /.test(command)) && !(/^[a-z]+$/.test(command))) command = `chat ${command}`;
        else MainLogger.log(`<span class="command-tip">topan-cli></span> ${textToSafeHtml(command)}`);
        socket.send(JSON.stringify({ type: "main", command }));
        $('.input-main').val('');
      }
    }
  });

  $('.input-room').keypress(event => {
    if ((event.keyCode ? event.keyCode : event.which) == '13') {
      if (allowSendInRoom && $('.input-room').val()) {
        var command = $('.input-room').val();
        socket.send(JSON.stringify({ type: "room", command }));
        $('.input-room').val('');
      }
    }
  });
});

function SetPassword(password) {
  if (password) {
    MainLogger.log(`<span class="command-tip">topan-cli></span> setpass`);
    socket.send(JSON.stringify({ type: "main", command: "setpass", password }));
  }
}
function Login(username, password) {
  if (username && password) {
    MainLogger.log(`<span class="command-tip">topan-cli></span> login`);
    socket.send(JSON.stringify({ type: "main", command: "login", username, password }));
  }
}
function Run(script, username) {
  if (script) {
    if (username) socket.send(JSON.stringify({ type: "main", command: "run", script, name: username }));
    else socket.send(JSON.stringify({ type: "main", command: "run", script }));
  }
}
function JoinRoom(room) {
  if (room) {
    MainLogger.log(`<span class="command-tip">topan-cli></span> join ${room}`);
    socket.send(JSON.stringify({ type: "main", command: `join ${room}` }));
  }
}
function atUser(name) {
  if (name) $('.input-main').val(`${$('.input-main').val()}@${name} `);
}
function voteUser(name) {
  if (name) $('.input-room').val(name);
}