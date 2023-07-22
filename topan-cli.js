const express = require('express');
const app = express();
const cors = require('cors');
const path = require('path');
app.use(cors());
app.use(require('cookie-parser')());
const bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
require('express-ws')(app);

const randomString = require('string-random');
const { readdirSync, existsSync, readFileSync, writeFileSync } = require('fs');
const { ensureDirSync } = require('fs-extra');
ensureDirSync('db');

const Logger = require('./lib/log.js');
const logger = new Logger('system');
const Help = require('./lib/help.js');

var Sockets = {};

function deleteOneCharInString(char, string) {
  var id = string.lastIndexOf(char);
  return string.substr(0, id) + string.substr(id + 1, string.length - 1);
}
function textToSafeHtml(text) {
  return text.replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char] || tag));
}
const icons = readdirSync('ui/icon');
function convertContent(content) {
  for (var icon of icons) {
    var name = icon.split('.')[0];
    if (/^[a-z]+$/.test(name))
      content = content.replace(
        new RegExp(`/${name}([^a-z])`, 'g'),
        (x, y) => `<img class="icon-emoji" src="/icon/${icon}">${y}`
      ).replace(
        new RegExp(`/${name}$`, 'g'),
        () => `<img class="icon-emoji" src="/icon/${icon}">`
      )
    else content = content.replace(
      new RegExp(`/${name}`, 'g'),
      () => `<img class="icon-emoji" src="/icon/${icon}">`
    );
  }
  return content;
}

const PLAYER_STATUS = {
  FREE: 0,
  IN_ROOM: 1,
  PLAYING: 2,
}, ROOM_STATUS = {
  WAITING: 0,
  PLAYING: 1,
  CLOSED: 2,
}, ROOM_PLAYER_LIMIT = 5;

var Players = {}, Rooms = {};
if (existsSync('db/players.json'))
  Players = JSON.parse(readFileSync('db/players.json', 'utf8'));
function getPlayerDisplay(player, roomId) {
  if (roomId) {
    var id = 0; while (Rooms[roomId].players[id] != player) id++;
    return `<span class="player-name-${id}">${textToSafeHtml(Players[player].name)}</span>`;
  }
  else return `<span class="player-name">${textToSafeHtml(Players[player].name)}</span>`;
}
function getInRoomTip(player) {
  if (Players[player].status == PLAYER_STATUS.FREE) return '';
  return `（您在房间 ${Players[player].room} 中。）`;
}
function savePlayers() {
  writeFileSync('db/players.json', JSON.stringify(Players));
}

if (existsSync('db/rooms.json'))
  Rooms = JSON.parse(readFileSync('db/rooms.json', 'utf8'));
function saveRooms() {
  writeFileSync('db/rooms.json', JSON.stringify(Rooms));
}
function allowSendInRoom(player) {
  if (Players[player].status != PLAYER_STATUS.PLAYING) return 'notallow';
  return Rooms[Players[player].room].waiting == player ? 'allow' : 'notallow';
}
function sendInRoom(roomId, message, to) {
  for (var socketId in Sockets) {
    var player = Sockets[socketId].player;
    if (Players[player].room != roomId) continue;
    if (to && player != to) continue;
    Sockets[socketId].socket
      .send(JSON.stringify([{ roomlog: message }]));
  }
}
function nextPlayer(roomId, player) {
  for (var i = 0; i < ROOM_PLAYER_LIMIT; i++)
    if (Rooms[roomId].players[i] == player)
      return Rooms[roomId].players[(i + 1) % ROOM_PLAYER_LIMIT];
}
function showCardStatusInRoom(roomId) {
  for (var socketId in Sockets) {
    var to = Sockets[socketId].player;
    if (Players[to].room != roomId) continue;
    var messages = new Array();
    Rooms[roomId].players.forEach(player => {
      if (player == to) messages.push({
        roomlog: `${getPlayerDisplay(player, roomId)}: `
          + `${Rooms[roomId].cards[player]}`
      });
      else messages.push({
        roomlog: `${getPlayerDisplay(player, roomId)}: `
          + `(${Rooms[roomId].cards[player].length})`
      });
    });
    Sockets[socketId].socket.send(JSON.stringify(messages));
  }
}
function waitForPlayer(roomId, to) {
  Rooms[roomId].waiting = to;
  var alwaysNotAllow = false;
  if (Rooms[roomId].cards[to].length == 0) {
    Rooms[roomId].status = ROOM_STATUS.CLOSED;
    Rooms[roomId].log.push({ type: "system.close", player: to });
    Rooms[roomId].players.forEach(player => {
      Players[player].status = PLAYER_STATUS.FREE;
      Players[player].room = '';
      for (var socketId in Sockets) {
        var thisplayer = Sockets[socketId].player;
        if (thisplayer != player) continue;
        Sockets[socketId].socket
          .send(JSON.stringify([
            { run: `result ${roomId}` },
            { cleanRoomlog: true },
          ]));
      }
    });
  }
  for (var socketId in Sockets) {
    var player = Sockets[socketId].player;
    if (Players[player].room != roomId) continue;
    if (player == to && !alwaysNotAllow)
      Sockets[socketId].socket
        .send(JSON.stringify([{ statusChange: 'allow' }]));
    else Sockets[socketId].socket
      .send(JSON.stringify([{ statusChange: 'notallow' }]));
  }
}

var WEIGHT = {};
function GameInit(roomId) {
  sendInRoom(roomId, `<span class="room-game-start">游戏开始！</span>`);
  var CARD_LIST = ("SS" + "2AKQJ09876543".repeat(4)).repeat(Math.ceil(ROOM_PLAYER_LIMIT / 3));
  for (var i = 1; i < 15; i++)WEIGHT[CARD_LIST[i]] = i;
  Rooms[roomId].cards = {};
  Rooms[roomId].log = new Array();
  Rooms[roomId].players.forEach(player => {
    Rooms[roomId].cards[player] = "";
    for (var i = 0; i < 18; i++) {
      var id = Math.floor(Math.random() * CARD_LIST.length);
      Rooms[roomId].cards[player] += CARD_LIST[id];
      CARD_LIST = deleteOneCharInString(CARD_LIST[id], CARD_LIST);
    }
    Rooms[roomId].cards[player] = Rooms[roomId].cards[player].split('')
      .sort((a, b) => WEIGHT[a] - WEIGHT[b]).join('');
    Rooms[roomId].log.push({ type: "system.deal", player, cards: Rooms[roomId].cards[player] });
  });
  var firstop = Rooms[roomId].players[Math.floor(Math.random() * ROOM_PLAYER_LIMIT)];
  Rooms[roomId].log.push({ type: "system.firstop", player: firstop });
  Rooms[roomId].log.push({ type: "system.newround" });
  showCardStatusInRoom(roomId);
  sendInRoom(roomId, `等待 ${getPlayerDisplay(firstop, roomId)} 出牌……`);
  Rooms[roomId].isNewRound = true;
  waitForPlayer(roomId, firstop); saveRooms();
}

function getMessageInRoom(roomId, player, command) {
  if (command == 'pass') {
    if (Rooms[roomId].isNewRound) throw "当前回合您先出牌，不能跳过。";
    Rooms[roomId].log.push({ type: "player.pass", player });
    sendInRoom(roomId, `${getPlayerDisplay(player, roomId)} 跳过了他的出牌阶段。`);
    showCardStatusInRoom(roomId);
    var newRound = true;
    for (var i = Rooms[roomId].log.length - 1;
      i >= Rooms[roomId].log.length - (ROOM_PLAYER_LIMIT - 1); i--)
      if (Rooms[roomId].log[i].type != "player.pass") newRound = false;
    if (newRound) {
      var newRoundFirstOp = Rooms[roomId].log[Rooms[roomId].log.length - ROOM_PLAYER_LIMIT].player;
      Rooms[roomId].log.push({ type: "system.newround" });
      Rooms[roomId].isNewRound = true;
      sendInRoom(roomId, `新回合开始。等待 ${getPlayerDisplay(newRoundFirstOp, roomId)} 出牌……`);
      waitForPlayer(roomId, newRoundFirstOp); saveRooms();
    }
    else {
      sendInRoom(roomId, `等待 ${getPlayerDisplay(nextPlayer(roomId, player), roomId)} 出牌……`);
      waitForPlayer(roomId, nextPlayer(roomId, player)); saveRooms();
    }
  }
  else if (command == 'check') {
    if (Rooms[roomId].isNewRound) throw "这是一个新的回合。";
    var lastLog = Rooms[roomId].log.length - 1;
    while (Rooms[roomId].log[lastLog].type != 'player.play') lastLog--;
    lastLog = Rooms[roomId].log[lastLog];
    sendInRoom(roomId, `${getPlayerDisplay(player, roomId)} 正在检验 ${getPlayerDisplay(lastLog.player, roomId)} 的真实性。`);
    sendInRoom(roomId, `${getPlayerDisplay(lastLog.player, roomId)} 真正打出的是 “${lastLog.cards}”。`);
    var allCards = "", logId = Rooms[roomId].log.length - 1;
    while (Rooms[roomId].log[logId].type != 'system.newround') {
      if (Rooms[roomId].log[logId].type == 'player.play')
        allCards += Rooms[roomId].log[logId].cards;
      logId--;
    }
    if (lastLog.isReal) {
      sendInRoom(roomId, `${getPlayerDisplay(player, roomId)} 检验失败，收下本轮的所有卡牌。`);
      Rooms[roomId].cards[player] += allCards;
      Rooms[roomId].cards[player] = Rooms[roomId].cards[player].split('')
        .sort((a, b) => WEIGHT[a] - WEIGHT[b]).join('');
      Rooms[roomId].log.push({ type: "player.check", player, success: false });
    }
    else {
      sendInRoom(roomId, `${getPlayerDisplay(player, roomId)} 检验成功，${getPlayerDisplay(lastLog.player, roomId)} 收下本轮的所有卡牌。`);
      Rooms[roomId].cards[lastLog.player] += allCards;
      Rooms[roomId].cards[lastLog.player] = Rooms[roomId].cards[lastLog.player].split('')
        .sort((a, b) => WEIGHT[a] - WEIGHT[b]).join('');
      Rooms[roomId].log.push({ type: "player.check", player, success: true });
    }
    Rooms[roomId].log.push({ type: "system.newround" });
    Rooms[roomId].isNewRound = true;
    showCardStatusInRoom(roomId);
    sendInRoom(roomId, `新回合开始。等待 ${getPlayerDisplay(player, roomId)} 出牌……`);
    waitForPlayer(roomId, player); saveRooms();
  }
  else {
    if (!(/^[S2AKQJ09876543]+? [2AKQJ09876543]+?$/.test(command)))
      throw "指令不合法。";
    var match = /^([S2AKQJ09876543]+?) ([2AKQJ09876543]+?)$/.exec(command);
    var real = match[1], display = match[2];
    if (real.length != display.length) throw "长度必须相等。";
    var tmp = Rooms[roomId].cards[player],
      repeatcard = display[0], isReal = true;
    if (repeatcard == 'S') throw "第二组卡牌中包含大小王。";
    for (var card of display)
      if (card != repeatcard) throw "第二组卡牌不全相同。";
    for (var card of real) {
      if (!tmp.includes(card)) throw `卡牌 “${card}” 不存在。`;
      if (card != repeatcard && card != 'S') isReal = false;
      tmp = deleteOneCharInString(card, tmp);
    }
    if (!Rooms[roomId].isNewRound) {
      var lastCards = Rooms[roomId].log.length - 1;
      while (Rooms[roomId].log[lastCards].type != 'player.play') lastCards--;
      lastCards = Rooms[roomId].log[lastCards].display;
      if (repeatcard != lastCards[0]) throw '第二组卡牌必须和上一个人出的牌相同。';
    }

    Rooms[roomId].log.push({ type: 'player.play', player, cards: real, display, isReal });
    Rooms[roomId].cards[player] = tmp, Rooms[roomId].isNewRound = false;
    sendInRoom(roomId, `${getPlayerDisplay(player, roomId)} 出牌：${display}`);
    showCardStatusInRoom(roomId);
    sendInRoom(roomId, `等待 ${getPlayerDisplay(nextPlayer(roomId, player), roomId)} 出牌……`);
    waitForPlayer(roomId, nextPlayer(roomId, player)); saveRooms();
  }
}

app.all('*', (req, res, next) => {
  if (!req.get('Origin')) return next();
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET');
  res.set('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type');
  if ('OPTIONS' == req.method) return res.send(200);
  else return next();
});

app.all('*', (req, res, next) => {
  var cookie = req.cookies['topan.client.cookie'];
  if (!cookie || !Players[cookie]) {
    cookie = randomString(32);
    Players[cookie] = {
      name: `Unnamed${randomString(4, '0123456789')}`,
      room: '', status: PLAYER_STATUS.FREE
    };
    savePlayers();
    res.cookie('topan.client.cookie', cookie);
  }
  req.player = cookie;
  return next();
});

app.use('/icon', express.static(path.join(__dirname, 'ui/icon')));

app.ws('/ws', (socket, req) => {
  var socketId = randomString(32);
  Sockets[socketId] = ({ player: req.player, socket });
  socket.on('message', body => {
    var isInRoom = false;
    try {
      var data = JSON.parse(body);
      if (data.type == "main") {
        var params = data.command.split(' ');
        if (!params[0]) throw "找不到指令。";
        else {
          if (params[0] == "init") {
            socket.send(JSON.stringify([
              { console: req.player },
              { mainlog: `Powered by <a href="//github.com/topan-dev/topan-cli.git">topan-dev/topan-cli</a>.` },
              { mainlog: `Copyright © 2023 <a href="//github.com/topan-dev">Topan Development Group</a>` },
              { mainlog: `服务器连接成功。` },
              { mainlog: `Hi, ${getPlayerDisplay(req.player)}!` + getInRoomTip(req.player) },
              { statusChange: allowSendInRoom(req.player) },
            ]));
            return;
          }
          if (params[0] == "reinit") {
            socket.send(JSON.stringify([
              { console: req.player },
              { mainlog: `服务器重连成功。` },
              { mainlog: `Hi, ${getPlayerDisplay(req.player)}!` + getInRoomTip(req.player) },
              { statusChange: allowSendInRoom(req.player) },
            ]));
            return;
          }
          if (params[0] == "help") {
            if (!params[1] || !Help[params[1]]) params[1] = 'main';
            socket.send(JSON.stringify(Help[params[1]]));
            return;
          }
          if (params[0] == "set") {
            if (!params[1] || params[1].startsWith('Unnamed')
              || params[1].length <= 3 || params[1].length > 12)
              throw "名字不合法。";
            else if (Players[req.player].status != PLAYER_STATUS.FREE)
              throw "在房间里不能修改名称。";
            else {
              var flag = false;
              for (var playerId in Players)
                if (Players[playerId].name.toLowerCase() == params[1].toLowerCase()) flag = true;
              if (flag) throw "名字已被占用。";
              else {
                Players[req.player].name = params[1];
                savePlayers();
                socket.send(JSON.stringify([{ mainlog: `Hi, ${getPlayerDisplay(req.player)}!` }]));
              }
            }
            return;
          }
          if (params[0] == "create") {
            if (Players[req.player].status != PLAYER_STATUS.FREE)
              throw "您不在空闲状态。";
            var roomId = randomString(4, "abcdefghijklmnopqrstuvwxyz");
            Rooms[roomId] = {
              players: [req.player], status: ROOM_STATUS.WAITING
            };
            Players[req.player].status = PLAYER_STATUS.IN_ROOM;
            Players[req.player].room = roomId;
            savePlayers(); saveRooms();
            socket.send(JSON.stringify([
              { mainlog: `创建成功。房间号码：${roomId}` },
              { mainlog: `已加入房间：${roomId}` },
            ]));
            return;
          }
          if (params[0] == "join") {
            if (Players[req.player].status != PLAYER_STATUS.FREE)
              throw "您不在空闲状态。";
            if (!params[1] || !Rooms[params[1]]) throw "找不到房间。";
            var roomId = params[1];
            if (Rooms[roomId].players.length >= ROOM_PLAYER_LIMIT) throw "房间人数已达到上限。";
            if (Rooms[roomId].status != ROOM_STATUS.WAITING) throw "房间不在等待状态。";
            Rooms[roomId].players.push(req.player);
            Players[req.player].status = PLAYER_STATUS.IN_ROOM;
            Players[req.player].room = roomId;
            savePlayers(); saveRooms();
            sendInRoom(roomId, `${getPlayerDisplay(req.player, roomId)} 加入房间。`);
            socket.send(JSON.stringify([
              { mainlog: `已加入房间：${roomId}` },
              { roomlog: `欢迎加入房间 ${roomId}！` },
              { roomlog: `当前房间成员：${Rooms[roomId].players.map(player => getPlayerDisplay(player, roomId)).join(' ')}` },
            ]));
            if (Rooms[roomId].players.length == ROOM_PLAYER_LIMIT) {
              Rooms[roomId].status = ROOM_STATUS.PLAYING;
              Rooms[roomId].players.forEach(player =>
                Players[player].status = PLAYER_STATUS.PLAYING);
              GameInit(roomId); savePlayers(); saveRooms();
            }
            return;
          }
          if (params[0] == "exit") {
            if (Players[req.player].status != PLAYER_STATUS.IN_ROOM)
              throw "您不在房间中或者已经开始游戏。";
            var roomId = Players[req.player].room, close = false;
            Rooms[roomId].players = Rooms[roomId].players
              .filter(player => player != req.player);
            if (!Rooms[roomId].players.length) close = true;
            Players[req.player].status = PLAYER_STATUS.FREE;
            Players[req.player].room = '';
            var message = `退出成功。`;
            if (close) {
              message += `房间无人，已自动关闭。`;
              delete Rooms[roomId];
            }
            else sendInRoom(roomId, `${getPlayerDisplay(req.player)} 退出房间。`);
            savePlayers(); saveRooms();
            socket.send(JSON.stringify([
              { mainlog: message },
              { cleanRoomlog: true },
            ]));
            return;
          }
          if (params[0] == "result") {
            if (!params[1] || !Rooms[params[1]]) throw "找不到房间。";
            if (Rooms[params[1]].status != ROOM_STATUS.CLOSED) throw "游戏还未结束。";
            var roomId = params[1], winner = Rooms[roomId]
              .log[Rooms[roomId].log.length - 1].player;
            socket.send(JSON.stringify([
              { mainlog: `${getPlayerDisplay(winner)} 赢得了这局游戏。` },
            ]));
            return;
          }
          if (params[0] == "chat") {
            if(Players[req.player].status!=PLAYER_STATUS.PLAYING)
              throw "已被禁言"
            if (params[1] && data.command.substr(5).length <= 100)
              for (var socketId in Sockets)
                Sockets[socketId].socket.send(JSON.stringify([
                  { mainlog: `${getPlayerDisplay(req.player)}：${convertContent(textToSafeHtml(data.command.substr(5)))}` },
                ]));
            else if (data.command.substr(5).length <= 100) throw "消息太长。";
            return;
          }
          throw "找不到指令。";
        }
      }
      if (data.type == "room") {
        isInRoom = true;
        if (allowSendInRoom(req.player) == 'notallow')
          throw "暂时不允许在此处发送信息。";
        var roomId = Players[req.player].room;
        getMessageInRoom(roomId, req.player, data.command);
      }
    } catch (e) {
      console.log(e)
      if (isInRoom) socket.send(JSON.stringify([
        { roomlog: `<span class="command-error">错误：</span>${e}` }]));
      else socket.send(JSON.stringify([
        { mainlog: `<span class="command-error">错误：</span>${e}` }]));
    }
  });

  socket.on('close', (e) => {
    delete Sockets[socketId];
  });
});

function getHomeHtml() {
  var homeHtml = readFileSync('ui/home.html', 'utf8');
  homeHtml = homeHtml.replace(/<(.+?) name="(.+?)"><\/.+?>/g,
    (html, tagName, fileName) => `<${tagName}>`
      + `${readFileSync(`ui/${fileName}`, 'utf8')}</${tagName}>`);
  return homeHtml;
}
app.get('/', (req, res) => {
  res.send(getHomeHtml());
});

var server = app.listen(2345, () => {
  logger.log(`Port ${server.address().port} is opened`);
});