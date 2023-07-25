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
      );
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
};
var WEIGHT = {};
{
  var CARD_LIST = "ST2AKQJ09876543";
  for (var i = 0; i < CARD_LIST.length; i++)WEIGHT[CARD_LIST[i]] = i;
}
function sortCards(cards) {
  return cards.split('').sort((a, b) => WEIGHT[a] - WEIGHT[b]).join('');
}

var Players = {}, Rooms = {};
if (existsSync('db/players.json'))
  Players = JSON.parse(readFileSync('db/players.json', 'utf8'));
function getPlayerDisplay(player, roomId) {
  var verify = '';
  if (Players[player].verify)
    verify += `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="#3498db"
      style="margin-bottom: -3px;">
      <path
        d="M16 8C16 6.84375 15.25 5.84375 14.1875 5.4375C14.6562 4.4375 14.4688 3.1875 13.6562 2.34375C12.8125 1.53125 11.5625 1.34375 10.5625 1.8125C10.1562 0.75 9.15625 0 8 0C6.8125 0 5.8125 0.75 5.40625 1.8125C4.40625 1.34375 3.15625 1.53125 2.34375 2.34375C1.5 3.1875 1.3125 4.4375 1.78125 5.4375C0.71875 5.84375 0 6.84375 0 8C0 9.1875 0.71875 10.1875 1.78125 10.5938C1.3125 11.5938 1.5 12.8438 2.34375 13.6562C3.15625 14.5 4.40625 14.6875 5.40625 14.2188C5.8125 15.2812 6.8125 16 8 16C9.15625 16 10.1562 15.2812 10.5625 14.2188C11.5938 14.6875 12.8125 14.5 13.6562 13.6562C14.4688 12.8438 14.6562 11.5938 14.1875 10.5938C15.25 10.1875 16 9.1875 16 8ZM11.4688 6.625L7.375 10.6875C7.21875 10.8438 7 10.8125 6.875 10.6875L4.5 8.3125C4.375 8.1875 4.375 7.96875 4.5 7.8125L5.3125 7C5.46875 6.875 5.6875 6.875 5.8125 7.03125L7.125 8.34375L10.1562 5.34375C10.3125 5.1875 10.5312 5.1875 10.6562 5.34375L11.4688 6.15625C11.5938 6.28125 11.5938 6.5 11.4688 6.625Z">
      </path>
    </svg>`;
  if (Players[player].badge)
    verify += `<span class="player-badge">${textToSafeHtml(Players[player].badge)}</span>`;
  if (roomId) {
    var id = 0; while (Rooms[roomId].players[id] != player) id++;
    return `<span class="player-name-${id}">${textToSafeHtml(Players[player].name)}</span>${verify}`;
  }
  else return `<span class="player-name">${textToSafeHtml(Players[player].name)}</span>${verify}`;
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
  return Rooms[Players[player].room].waiting.includes(player) ? 'allow' : 'notallow';
}
function closeRoom(roomId, noresult) {
  Rooms[roomId].status = ROOM_STATUS.CLOSED;
  Rooms[roomId].players.forEach(player => {
    Players[player].status = PLAYER_STATUS.FREE;
    Players[player].room = '';
    if (!noresult)
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
  saveRooms(); savePlayers();
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
  for (var i = 0; i < Rooms[roomId].limit; i++)
    if (Rooms[roomId].players[i] == player)
      return Rooms[roomId].players[(i + 1) % Rooms[roomId].limit];
}
function showCardStatusInRoom(roomId) {
  for (var socketId in Sockets) {
    var to = Sockets[socketId].player;
    if (Players[to].room != roomId) continue;
    var messages = new Array();
    Rooms[roomId].players.forEach(player => {
      Rooms[roomId].cards[player] = sortCards(Rooms[roomId].cards[player]);
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
  if (Rooms[roomId].mode == 'hupai' && Rooms[roomId].cards[to[0]].length == 0) {
    Rooms[roomId].log.push({ type: "system.close", player: to[0] });
    closeRoom(roomId);
  }
  saveRooms(); savePlayers();
  for (var socketId in Sockets) {
    var player = Sockets[socketId].player;
    if (Players[player].room != roomId) continue;
    if (to.includes(player) && !alwaysNotAllow)
      Sockets[socketId].socket
        .send(JSON.stringify([{ statusChange: 'allow' }]));
    else Sockets[socketId].socket
      .send(JSON.stringify([{ statusChange: 'notallow' }]));
  }
}

var GAME_MODE = {};

{
  function GameInit(roomId) {
    sendInRoom(roomId, `<span class="room-game-start">游戏开始！</span>`);
    var CARD_LIST = ("SS" + "2AKQJ09876543".repeat(4)).repeat(Math.ceil(Rooms[roomId].limit / 3));
    Rooms[roomId].cards = {};
    Rooms[roomId].log = new Array();
    Rooms[roomId].players.forEach(player => {
      Rooms[roomId].cards[player] = "";
      for (var i = 0; i < 18; i++) {
        var id = Math.floor(Math.random() * CARD_LIST.length);
        Rooms[roomId].cards[player] += CARD_LIST[id];
        CARD_LIST = deleteOneCharInString(CARD_LIST[id], CARD_LIST);
      }
      Rooms[roomId].log.push({ type: "system.deal", player, cards: Rooms[roomId].cards[player] });
    });
    var firstop = Rooms[roomId].players[Math.floor(Math.random() * Rooms[roomId].limit)];
    Rooms[roomId].log.push({ type: "system.firstop", player: firstop });
    Rooms[roomId].log.push({ type: "system.newround" });
    showCardStatusInRoom(roomId);
    sendInRoom(roomId, `等待 ${getPlayerDisplay(firstop, roomId)} 出牌……`);
    Rooms[roomId].isNewRound = true;
    waitForPlayer(roomId, [firstop]); saveRooms();
  }

  function getMessageInRoom(roomId, player, command) {
    if (command == 'pass') {
      if (Rooms[roomId].isNewRound) throw "当前回合您先出牌，不能跳过。";
      Rooms[roomId].log.push({ type: "player.pass", player });
      sendInRoom(roomId, `${getPlayerDisplay(player, roomId)} 跳过了他的出牌阶段。`);
      showCardStatusInRoom(roomId);
      var newRound = true;
      for (var i = Rooms[roomId].log.length - 1;
        i >= Rooms[roomId].log.length - (Rooms[roomId].limit - 1); i--)
        if (Rooms[roomId].log[i].type != "player.pass") newRound = false;
      if (newRound) {
        var newRoundFirstOp = Rooms[roomId].log[Rooms[roomId].log.length - Rooms[roomId].limit].player;
        Rooms[roomId].log.push({ type: "system.newround" });
        Rooms[roomId].isNewRound = true;
        sendInRoom(roomId, `新回合开始。等待 ${getPlayerDisplay(newRoundFirstOp, roomId)} 出牌……`);
        waitForPlayer(roomId, [newRoundFirstOp]);
      }
      else {
        sendInRoom(roomId, `等待 ${getPlayerDisplay(nextPlayer(roomId, player), roomId)} 出牌……`);
        waitForPlayer(roomId, [nextPlayer(roomId, player)]);
      }
      saveRooms();
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
        Rooms[roomId].log.push({ type: "player.check", player, success: false });
      }
      else {
        sendInRoom(roomId, `${getPlayerDisplay(player, roomId)} 检验成功，${getPlayerDisplay(lastLog.player, roomId)} 收下本轮的所有卡牌。`);
        Rooms[roomId].cards[lastLog.player] += allCards;
        Rooms[roomId].log.push({ type: "player.check", player, success: true });
      }
      Rooms[roomId].log.push({ type: "system.newround" });
      Rooms[roomId].isNewRound = true;
      showCardStatusInRoom(roomId);
      sendInRoom(roomId, `新回合开始。等待 ${getPlayerDisplay(player, roomId)} 出牌……`);
      waitForPlayer(roomId, [player]); saveRooms();
    }
    else {
      if (!(/^[S2AKQJ09876543]+? [2AKQJ09876543]+?$/.test(command)))
        throw "指令不合法。";
      var match = /^([S2AKQJ09876543]+?) ([2AKQJ09876543]+?)$/.exec(command);
      var real = match[1], display = match[2];
      if (real.length != display.length) throw "长度必须相等。";
      if (real.length > 6) throw "长度不能超过 6。";
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
      waitForPlayer(roomId, [nextPlayer(roomId, player)]); saveRooms();
    }
  }

  function Export(roomId) {
    var exports = new Array(), consoleexports = '';
    exports.push({
      mainlog: `${Rooms[roomId].players
        .map(player => getPlayerDisplay(player, roomId)).join(' ')} 开始了这局 <strong>胡牌</strong> 游戏。`
    });
    consoleexports += `${Rooms[roomId].players
      .map(player => Players[player].name).join(' ')} 开始了这局 **胡牌** 游戏。\n\n`;
    var cards = {};
    function getCardsStatus() {
      return Rooms[roomId].players.map(player => {
        return { mainlog: `${getPlayerDisplay(player)}：(${cards[player].length}) ${sortCards(cards[player])}` }
      });
    }
    function getCardsMarkdownStatus() {
      return Rooms[roomId].players.map(player =>
        `${Players[player].name}：(${cards[player].length}) ${sortCards(cards[player])}`).join('  \n');
    }
    var lastlog, thisround;
    for (var log of Rooms[roomId].log) {
      if (log.type == 'system.deal') cards[log.player] = log.cards;
      else if (log.type == 'system.newround') {
        exports.push({ mainlog: '新回合开始。' });
        consoleexports += `新回合开始。\n\n`;
        exports = exports.concat(getCardsStatus());
        consoleexports += `${getCardsMarkdownStatus()}\n\n`;
        thisround = '';
      }
      else if (log.type == 'player.play') {
        exports.push({
          mainlog: `${getPlayerDisplay(log.player, roomId)} 出牌：`
            + `<strong>${sortCards(log.display)}</strong>（实际上是 ${sortCards(log.cards)}）`
        });
        consoleexports += `${Players[log.player].name} 出牌：`
          + `**${sortCards(log.display)}**（实际上是 ${sortCards(log.cards)}）\n\n`;
        thisround += log.cards;
        for (var card of log.cards)
          cards[log.player] = deleteOneCharInString(card, cards[log.player]);
      }
      else if (log.type == 'player.check') {
        exports.push({
          mainlog: `${getPlayerDisplay(log.player, roomId)} `
            + `检验了 ${getPlayerDisplay(lastlog.player, roomId)} 的真实性。`
        });
        consoleexports += `${Players[log.player].name} `
          + `检验了 ${Players[lastlog.player].name} 的真实性。  \n`;
        if (log.success) {
          exports.push({ mainlog: `${getPlayerDisplay(log.player, roomId)} 检验成功。` });
          consoleexports += `${Players[log.player].name} 检验成功。  \n`;
          exports.push({
            mainlog: `${getPlayerDisplay(lastlog.player, roomId)}`
              + ` 收下了这回合出的 ${thisround.length} 张牌。`
          });
          consoleexports += `${Players[lastlog.player].name} 收下了这回合出的 ${thisround.length} 张牌。\n\n`;
          cards[lastlog.player] += thisround;
        }
        else {
          exports.push({ mainlog: `${getPlayerDisplay(log.player, roomId)} 检验失败。` });
          consoleexports += `${Players[log.player].name} 检验失败。  \n`;
          exports.push({
            mainlog: `${getPlayerDisplay(log.player, roomId)}`
              + ` 收下了这回合出的 ${thisround.length} 张牌。`
          });
          consoleexports += `${Players[log.player].name} 收下了这回合出的 ${thisround.length} 张牌。\n\n`;
          cards[log.player] += thisround;
        }
      }
      else if (log.type == 'player.pass') {
        exports.push({ mainlog: `${getPlayerDisplay(log.player, roomId)} 跳过了他的出牌阶段。` });
        consoleexports += `${Players[log.player].name} 跳过了他的出牌阶段。\n\n`;
      }
      if (log.type != 'player.pass') lastlog = log;
    }
    exports.push({ mainlog: `${getPlayerDisplay(lastlog.player)} 赢得了这局游戏。` });
    consoleexports += `**${Players[lastlog.player].name} 赢得了这局游戏。**`;
    exports.push({ console: consoleexports });
    return exports;
  }

  GAME_MODE.hupai = { GameInit, getMessageInRoom, Export, minLimit: 2, maxLimit: 1000 };
}

{
  const CARD_TYPE = {
    SINGLE: 1,
    PAIR: 2,
    THREE: 3,
    STRAIGHT: 4,
    PAIRS: 5,
    BOMB: 6,
  };

  function GameInit(roomId) {
    sendInRoom(roomId, `<span class="room-game-start">游戏开始！</span>`);
    var firstop = Rooms[roomId].players[Math.floor(Math.random() * Rooms[roomId].limit)];
    var CARD_LIST = ("SS" + "2AKQJ09876543".repeat(4)).repeat(Math.ceil(Rooms[roomId].limit / 3));
    Rooms[roomId].cards = {};
    Rooms[roomId].log = new Array();
    Rooms[roomId].players.forEach(player => {
      Rooms[roomId].cards[player] = "";
      for (var i = 0; i < 5 + (player == firstop); i++) {
        var id = Math.floor(Math.random() * CARD_LIST.length);
        Rooms[roomId].cards[player] += CARD_LIST[id];
        CARD_LIST = deleteOneCharInString(CARD_LIST[id], CARD_LIST);
      }
      Rooms[roomId].log.push({ type: "system.deal", player, cards: Rooms[roomId].cards[player] });
    });
    Rooms[roomId].cardlist = CARD_LIST;
    Rooms[roomId].log.push({ type: "system.firstop", player: firstop });
    Rooms[roomId].log.push({ type: "system.newround" });
    showCardStatusInRoom(roomId);
    sendInRoom(roomId, `等待 ${getPlayerDisplay(firstop, roomId)} 出牌……`);
    Rooms[roomId].isNewRound = true;
    waitForPlayer(roomId, [firstop]); saveRooms();
  }

  function getMessageInRoom(roomId, player, command) {
    if (command == 'pass') {
      if (Rooms[roomId].isNewRound) throw "当前回合您先出牌，不能跳过。";
      Rooms[roomId].log.push({ type: "player.pass", player });
      sendInRoom(roomId, `${getPlayerDisplay(player, roomId)} 跳过了他的出牌阶段。`);
      showCardStatusInRoom(roomId);
      var newRound = true;
      for (var i = Rooms[roomId].log.length - 1;
        i >= Rooms[roomId].log.length - (Rooms[roomId].limit - 1); i--)
        if (Rooms[roomId].log[i].type != "player.pass") newRound = false;
      if (newRound) {
        var newRoundFirstOp = Rooms[roomId].log[Rooms[roomId].log.length - Rooms[roomId].limit].player;
        Rooms[roomId].log.push({ type: "system.newround" });
        Rooms[roomId].isNewRound = true;
        sendInRoom(roomId, `新回合开始。等待 ${getPlayerDisplay(newRoundFirstOp, roomId)} 出牌……`);
        waitForPlayer(roomId, [newRoundFirstOp]);
      }
      else {
        sendInRoom(roomId, `等待 ${getPlayerDisplay(nextPlayer(roomId, player), roomId)} 出牌……`);
        waitForPlayer(roomId, [nextPlayer(roomId, player)]);
      }
      saveRooms();
    }
    else {
      if (!(/^[S2AKQJ09876543]+$/.test(command))) throw "指令不合法。";
      var tmp = Rooms[roomId].cards[player];
      for (var card of command) {
        if (!tmp.includes(card)) throw `卡牌 “${card}” 不存在。`;
        tmp = deleteOneCharInString(card, tmp);
      }
      var cardtype;
      if (command.length == 1) {
        cardtype = CARD_TYPE.SINGLE;
        if (command == 'S') throw "王不能当作单牌出。";
      }
      if (command.length == 2) {
        cardtype = CARD_TYPE.PAIR;
        if ((command[0] != command[1] && !command.includes('S'))
          || command == 'SS') throw "牌型不合法。";
      }
      if (command.length == 3) {
        cardtype = CARD_TYPE.THREE;
        if ((command[0] != command[1] && !command.includes('S'))
          || command == 'SS') throw "牌型不合法。";
      }
      if (Rooms[roomId].isNewRound) {
      }
      sendInRoom(roomId, `${getPlayerDisplay(player, roomId)} 出牌：${display}`);
      showCardStatusInRoom(roomId);
      sendInRoom(roomId, `等待 ${getPlayerDisplay(nextPlayer(roomId, player), roomId)} 出牌……`);
      waitForPlayer(roomId, [nextPlayer(roomId, player)]); saveRooms();
    }
  }

  // GAME_MODE.gandengyan = { GameInit, getMessageInRoom };
}

{
  const STAGE = {
    WAITING_FOR_ADMIN: 0,
    PLAYER_DESCRIBE: 1,
    VOTING: 2,
  };

  function GameInit(roomId) {
    var admin; admin = Rooms[roomId].admin = Rooms[roomId].players[0];
    Rooms[roomId].log = new Array();
    Rooms[roomId].removed = new Array();
    Rooms[roomId].noout = 0;
    sendInRoom(roomId, `等待 ${getPlayerDisplay(admin, roomId)} 设置题目。`);
    Rooms[roomId].stage = STAGE.WAITING_FOR_ADMIN;
    Rooms[roomId].wodi = Rooms[roomId].players[parseInt(Math.random()
      * (Rooms[roomId].players.length - 1)) + 1];
    Rooms[roomId].log.push({ type: 'system.start', player: admin, wodi: Rooms[roomId].wodi });
    waitForPlayer(roomId, [admin]); saveRooms();
  }

  function getMessageInRoom(roomId, player, command) {
    var { admin, wodi } = Rooms[roomId];
    if (Rooms[roomId].stage == STAGE.WAITING_FOR_ADMIN) {
      if (!(/^[^ ]+? [^ ]+?$/.test(command))) throw "格式错误。";
      var match = /^([^ ]+?) ([^ ]+?)$/.exec(command);
      var common = match[1], special = match[2];
      Rooms[roomId].log.push({ type: 'player.words', player: admin, common, special });

      sendInRoom(roomId, `<span class="room-game-start">游戏开始！</span>`);
      for (var socketId in Sockets) {
        var to = Sockets[socketId].player;
        if (Players[to].room != roomId) continue;
        if (to == admin)
          Sockets[socketId].socket.send(JSON.stringify([
            { roomlog: `词语已经成功下发给玩家。` },
            { roomlog: `本局卧底是 ${getPlayerDisplay(Rooms[roomId].wodi, roomId)}。` },
          ]));
        else if (to == wodi)
          Sockets[socketId].socket.send(JSON.stringify([
            { roomlog: `收到词语：<strong>${special}</strong>` },
          ]));
        else Sockets[socketId].socket.send(JSON.stringify([
          { roomlog: `收到词语：<strong>${common}</strong>` },
        ]));
      }

      sendInRoom(roomId, `等待各位选手完成自己的描述。（可以等之前的人完成描述后再完成描述，也可以提前完成。）`);
      sendInRoom(roomId, `等待 ${getPlayerDisplay(Rooms[roomId].players[1], roomId)} 完成描述。`);
      Rooms[roomId].stage = STAGE.PLAYER_DESCRIBE;
      Rooms[roomId].sent = 0;
      Rooms[roomId].descriptions = {};
      for (var pl of Rooms[roomId].players) if (pl != admin)
        Rooms[roomId].descriptions[pl] = { locked: false, submitted: false };
      waitForPlayer(roomId, Rooms[roomId].players);
      saveRooms(); return;
    }

    if (Rooms[roomId].stage == STAGE.PLAYER_DESCRIBE) {
      if (player != admin) {
        if (!Rooms[roomId].descriptions[player])
          throw "已被淘汰。";
        if (Rooms[roomId].descriptions[player].submitted)
          throw "已经提交审核无法（也无需）再次更改。";
        Rooms[roomId].descriptions[player].text = command;
        Rooms[roomId].descriptions[player].submitted = true;

        for (var socketId in Sockets) {
          var to = Sockets[socketId].player;
          if (Players[to].room != roomId) continue;
          if (to == admin)
            Sockets[socketId].socket.send(JSON.stringify([
              { roomlog: `${getPlayerDisplay(player, roomId)} 提交了描述：${textToSafeHtml(command)}` },
            ]));
          else if (to == player)
            Sockets[socketId].socket.send(JSON.stringify([
              { roomlog: `描述提交成功，等待裁判审核。` },
            ]));
        }
      }
      else {
        var params = command.split(' ');
        if (!params[0] || !params[1] || (params[1] != '1' && params[1] != '0')) throw "参数错误。";
        if (params[1] == '0' && !params[2]) params[2] = '（无信息）';
        for (var pl of Rooms[roomId].players)
          for (var pl of Rooms[roomId].players)
            if (Players[pl].name == params[0] && admin != pl) {
              if (!Rooms[roomId].descriptions[pl]) throw "已被淘汰。";
              if (Rooms[roomId].descriptions[pl].locked) throw "已经通过审核。";
              if (!Rooms[roomId].descriptions[pl].submitted) throw "还没有提交审核。";
              var playerMessage, adminMessage,
                messages = new Array(), total = 0, updated = false, nxt;
              for (var p in Rooms[roomId].descriptions)
                if (Rooms[roomId].descriptions[p].locked) total++;
              if (params[1] == '0') {
                Rooms[roomId].descriptions[pl].submitted = false;
                playerMessage = `审核未通过，原因是：${params[2]}`;
                adminMessage = `打回成功。`;
              } else {
                Rooms[roomId].descriptions[pl].locked = true;
                playerMessage = `审核已通过！`;
                adminMessage = `通过成功。`;
                sendInRoom(roomId, `已有 ${++total} 人通过了审核。`);
                var id = 0;
                for (var p in Rooms[roomId].descriptions) {
                  if (id >= Rooms[roomId].sent) {
                    if (!Rooms[roomId].descriptions[p].locked) break;
                    sendInRoom(roomId, `${getPlayerDisplay(p, roomId)} 描述：${Rooms[roomId].descriptions[p].text}`);
                    Rooms[roomId].log.push({ type: 'player.describe', player: p, text: Rooms[roomId].descriptions[p].text });
                    updated = true; Rooms[roomId].sent++; nxt = nextPlayer(roomId, p);
                  }
                  id++;
                }
                if (Rooms[roomId].sent == Rooms[roomId].players.length - 1 - Rooms[roomId].removed.length) {
                  messages.push(`玩家描述阶段结束。`);
                  messages.push(`投票阶段开始。等待玩家投票。`);
                  Rooms[roomId].stage = STAGE.VOTING;
                  waitForPlayer(roomId, Rooms[roomId].players.slice(1));
                  Rooms[roomId].vote = {};
                  for (var p of Rooms[roomId].players)
                    if (p != admin && !Rooms[roomId].removed.includes(p))
                      Rooms[roomId].vote[p] = '';
                }
              }
              if (updated && Rooms[roomId].stage != STAGE.VOTING) {
                sendInRoom(roomId, `等待 ${getPlayerDisplay(nxt, roomId)} 完成描述。`);
                waitForPlayer(roomId, Rooms[roomId].players.filter(pl =>
                  admin == pl || (Rooms[roomId].descriptions[pl]
                    && !Rooms[roomId].descriptions[pl].locked)));
              }

              for (var socketId in Sockets) {
                var to = Sockets[socketId].player;
                if (Players[to].room != roomId) continue;
                if (to == admin)
                  Sockets[socketId].socket.send(JSON.stringify([
                    { roomlog: adminMessage },
                  ]));
                else if (to == pl)
                  Sockets[socketId].socket.send(JSON.stringify([
                    { roomlog: playerMessage },
                  ]));
                Sockets[socketId].socket.send(JSON.stringify(messages
                  .map(m => { return { roomlog: m } })));
              }
              saveRooms(); return;
            }
        throw "找不到玩家。";
      }
      saveRooms(); return;
    }

    if (Rooms[roomId].stage == STAGE.VOTING) {
      if (Rooms[roomId].removed.includes(player)) throw "已经出局。";
      for (var pl of Rooms[roomId].players.concat(['pass'])) {
        if ((pl == 'pass' && command == pl) || (pl != 'pass'
          && Players[pl].name == command && admin != pl
          && (Rooms[roomId].vote[player] || Rooms[roomId].vote[player] == ''))) {
          var total = 0, updated = false;
          if (Rooms[roomId].vote[player] == '') updated = true;
          Rooms[roomId].vote[player] = pl;
          for (var p in Rooms[roomId].vote)
            if (Rooms[roomId].vote[p] != '') total++;
          if (updated) {
            if (total == Rooms[roomId].players.length - 1 - Rooms[roomId].removed.length) {
              var vote = {};
              for (var p in Rooms[roomId].vote) {
                Rooms[roomId].log.push({ type: 'player.vote', player: p, vote: Rooms[roomId].vote[p] });
                vote[p] = 0;
              }
              var maxvote = 0, totalmax = 0;
              for (var p in Rooms[roomId].vote) {
                if (Rooms[roomId].vote[p] == 'pass') continue;
                vote[Rooms[roomId].vote[p]]++;
                if (vote[Rooms[roomId].vote[p]] > maxvote)
                  maxvote = vote[Rooms[roomId].vote[p]];
              }
              for (var p in Rooms[roomId].vote)
                if (vote[p] == maxvote) totalmax++;

              function showVoteResult() {
                for (var p in Rooms[roomId].vote)
                  if (Rooms[roomId].vote[p] == 'pass')
                    sendInRoom(roomId, `${getPlayerDisplay(p, roomId)} 选择了弃票。`);
                  else sendInRoom(roomId, `${getPlayerDisplay(p, roomId)} 投了 ${getPlayerDisplay(Rooms[roomId].vote[p], roomId)}。`);
                for (var p in Rooms[roomId].vote)
                  sendInRoom(roomId, `${getPlayerDisplay(p, roomId)} 获得 ${vote[p]} 票。`);
              }
              function newVoteRound() {
                sendInRoom(roomId, `新回合开始。`);
                Rooms[roomId].stage = STAGE.PLAYER_DESCRIBE;
                sendInRoom(roomId, `等待各位选手完成自己的描述。（可以等之前的人完成描述后再完成描述，也可以提前完成。）`);
                Rooms[roomId].sent = 0;
                Rooms[roomId].descriptions = {};
                Rooms[roomId].players.forEach(pl => {
                  if (pl != admin && !Rooms[roomId].removed.includes(pl))
                    Rooms[roomId].descriptions[pl] = { locked: false, submitted: false };
                });
                var nextpl = 1;
                while (Rooms[roomId].removed.includes(Rooms[roomId].players[nextpl])) nextpl++;
                sendInRoom(roomId, `等待 ${getPlayerDisplay(Rooms[roomId].players[nextpl], roomId)} 完成描述。`);
                waitForPlayer(roomId, Rooms[roomId].players.filter(pl =>
                  !Rooms[roomId].removed.includes(pl)));
                saveRooms();
              }

              if (totalmax >= 2) {
                Rooms[roomId].noout++;
                if (Rooms[roomId].noout == 3) {
                  sendInRoom(roomId, `连续 3 次投票无人出局，游戏结束。`);
                  closeRoom(roomId); saveRooms(); return;
                }
                showVoteResult();
                sendInRoom(roomId, `本轮投票无人出局。`);
                newVoteRound(); return;
              }
              Rooms[roomId].noout = 0;
              showVoteResult();
              var wodilose = false;
              Rooms[roomId].players.forEach(p => {
                if (!vote[p] || vote[p] != maxvote) return;
                if (wodi == p) wodilose = true;
                Rooms[roomId].removed.push(p);
              });
              sendInRoom(roomId, `${Rooms[roomId].players.filter(p =>
                vote[p] == maxvote).map(p => getPlayerDisplay(p, roomId)).join(' ')
                } 出局了。`);
              if (wodilose) {
                sendInRoom(roomId, `卧底出局了，游戏结束。`);
                Rooms[roomId].log.push({ type: 'system.close', result: 'common' });
                closeRoom(roomId); saveRooms(); return;
              }
              if (Rooms[roomId].players.length - 1 - Rooms[roomId].removed.length <= 2) {
                sendInRoom(roomId, `剩余玩家人数 <= 2，游戏结束。`);
                Rooms[roomId].log.push({ type: 'system.close', result: 'wodi' });
                closeRoom(roomId); saveRooms(); return;
              }
              newVoteRound(); return;
            }
            sendInRoom(roomId, `已有 ${total} 人完成了投票。`);
          }
          saveRooms(); return;
        }
      }
      throw "找不到玩家。";
    }
  }

  function Export(roomId) {
    var exports = new Array(), consoleexports = '';
    exports.push({ mainlog: `${getPlayerDisplay(Rooms[roomId].wodi, roomId)} 是卧底。` });
    if (Rooms[roomId].log[Rooms[roomId].log.length - 1].result == 'wodi')
      exports.push({ mainlog: `卧底获胜。` });
    else exports.push({ mainlog: `普通玩家获胜。` });
    exports.push({ console: consoleexports });
    return exports;
  }

  GAME_MODE.whoiswodi = { GameInit, getMessageInRoom, Export, minLimit: 4, maxLimit: 1000 };
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
          if (params[0] == "status") {
            var Online = new Set(), OnlinePlayers = new Array();
            for (var socketId in Sockets)
              if (!Online.has(Sockets[socketId].player))
                Online.add(Sockets[socketId].player),
                  OnlinePlayers.push(Sockets[socketId].player);
            socket.send(JSON.stringify([{
              mainlog: `当前在线用户：${OnlinePlayers
                .map(player => getPlayerDisplay(player)).join(' ')}`
            }]));
            return;
          }
          if (params[0] == "set") {
            if (!params[1] || params[1].startsWith('Unnamed')
              || params[1] == 'pass'
              || params[1].length <= 3 || params[1].length > 12
              || !(/^[A-Z0-9a-z_\^]*$/.test(params[1])))
              throw "名字不合法。";
            else if (Players[req.player].status != PLAYER_STATUS.FREE)
              throw "在房间里不能修改名称。";
            else if (Players[req.player].verify)
              throw "您已经认证。";
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
          if (params[0] == "setbadge") {
            if (!params[1] || (params[1].length > 6 && !Players[req.player].admin))
              throw "Badge 内容不合法。";
            if (!Players[req.player].verify)
              throw "请先完成认证";
            Players[req.player].badge = params[1]; savePlayers();
            socket.send(JSON.stringify([{ mainlog: `Badge 更新成功。` }]));
            return;
          }
          if (params[0] == "setpass") {
            if (!data.password) throw "请从控制台操作（具体见 “help setpass”）。";
            Players[req.player].password = data.password;
            savePlayers();
            socket.send(JSON.stringify([{ mainlog: `密码设置成功。` }]));
            return;
          }
          if (params[0] == "login") {
            if (!data.password || !data.username)
              throw "请从控制台操作（具体见 “help login”）。";
            for (var playerId in Players)
              if (Players[playerId].name == data.username) {
                if (Players[playerId].password) {
                  if (Players[playerId].password == data.password) {
                    socket.send(JSON.stringify([
                      { mainlog: `登录成功。` },
                      { mainlog: `Hi, ${getPlayerDisplay(playerId)} !` },
                      { cookie: playerId },
                    ]));
                    return;
                  }
                  else throw "密码错误。";
                }
                else throw "该用户未设置密码。";
              }
            throw "找不到用户。";
          }
          if (params[0] == "create") {
            if (Players[req.player].status != PLAYER_STATUS.FREE)
              throw "您不在空闲状态。";
            var roomId = randomString(4, "abcdefghijklmnopqrstuvwxyz"), cnt;
            if (!params[1] || !params[2]) throw "请输入人数和模式。";
            try { cnt = parseInt(params[1]); }
            catch (e) { throw "人数不合法。"; }
            if (!GAME_MODE[params[2]]) throw "模式不存在。"
            if (cnt != Math.floor(cnt) || cnt < GAME_MODE[params[2]].minLimit || cnt > GAME_MODE[params[2]].maxLimit) throw "人数不合法。";
            Rooms[roomId] = {
              players: [req.player], status: ROOM_STATUS.WAITING,
              limit: cnt, mode: params[2]
            };
            Players[req.player].status = PLAYER_STATUS.IN_ROOM;
            Players[req.player].room = roomId;
            savePlayers(); saveRooms();
            var messages = Help[`mode.${Rooms[roomId].mode}.tip`];
            messages = messages.concat([{ roomlog: `----------` }]);
            messages = messages.concat([{ roomlog: `<strong>以下是游戏规则：</strong>` }]);
            messages = messages.concat(Help[`mode.${Rooms[roomId].mode}`]
              .map(message => { return { roomlog: message.mainlog } }));
            messages.push({ roomlog: `----------` });
            socket.send(JSON.stringify(messages.concat([
              { mainlog: `创建成功。房间号码：${roomId} ` },
              { mainlog: `已加入房间：${roomId}` },
              { roomlog: `欢迎加入房间 ${roomId}！` },
              { roomlog: `当前房间成员：${Rooms[roomId].players.map(player => getPlayerDisplay(player, roomId)).join(' ')}` },
            ])));
            return;
          }
          if (params[0] == "join") {
            if (Players[req.player].status != PLAYER_STATUS.FREE)
              throw "您不在空闲状态。";
            if (!params[1] || !Rooms[params[1]]) throw "找不到房间。";
            var roomId = params[1];
            if (Rooms[roomId].players.length >= Rooms[roomId].limit) throw "房间人数已达到上限。";
            if (Rooms[roomId].status != ROOM_STATUS.WAITING) throw "房间不在等待状态。";
            Rooms[roomId].players.push(req.player);
            Players[req.player].status = PLAYER_STATUS.IN_ROOM;
            Players[req.player].room = roomId;
            savePlayers(); saveRooms();
            sendInRoom(roomId, `${getPlayerDisplay(req.player, roomId)} 加入房间。`);
            var messages = Help[`mode.${Rooms[roomId].mode}.tip`];
            messages = messages.concat([{ roomlog: `----------` }]);
            messages = messages.concat([{ roomlog: `<strong>以下是游戏规则：</strong> ` }]);
            messages = messages.concat(Help[`mode.${Rooms[roomId].mode}`]
              .map(message => { return { roomlog: message.mainlog } }));
            messages.push({ roomlog: `----------` });
            socket.send(JSON.stringify(messages.concat([
              { mainlog: `已加入房间：${roomId} ` },
              { roomlog: `欢迎加入房间 ${roomId}！` },
              { roomlog: `当前房间成员：${Rooms[roomId].players.map(player => getPlayerDisplay(player, roomId)).join(' ')}` },
            ])));
            if (Rooms[roomId].players.length == Rooms[roomId].limit) {
              Rooms[roomId].status = ROOM_STATUS.PLAYING;
              Rooms[roomId].players.forEach(player =>
                Players[player].status = PLAYER_STATUS.PLAYING);
              GAME_MODE[Rooms[roomId].mode].GameInit(roomId);
              savePlayers(); saveRooms();
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
            var roomId = params[1];
            socket.send(JSON.stringify(GAME_MODE[Rooms[roomId].mode].Export(roomId)));
            return;
          }
          if (params[0] == "chat") {
            if (!Players[req.player].verify)
              throw "请先完成认证。";
            // if (Players[req.player].status == PLAYER_STATUS.PLAYING
            //   && Rooms[Players[req.player].room].mode == 'whoiswodi'
            //   && Rooms[Players[req.player].room].admin != req.player)
            //   throw "游戏规则为谁是卧底，规定游戏时非裁判不能发言。";
            if (params[1] && data.command.substr(5).length <= 100)
              for (var socketId in Sockets)
                Sockets[socketId].socket.send(JSON.stringify([
                  { mainlog: `${getPlayerDisplay(req.player)}：${convertContent(textToSafeHtml(data.command.substr(5)))}` },
                ]));
            else if (data.command.substr(5).length > 100) throw "消息太长。";
            return;
          }
          if (params[0] == "close") {
            if (!Players[req.player].admin) throw "权限不足。";
            if (!params[1] || !Rooms[params[1]]) throw "房间不存在。";
            closeRoom(params[1], true);
            savePlayers(); saveRooms();
            socket.send(JSON.stringify([
              { mainlog: `已关闭房间。` },
            ]));
            return;
          }
          if (params[0] == "verify") {
            if (!Players[req.player].admin) throw "权限不足。";
            if (!params[1]) throw "请输入用户名。";
            for (var playerId in Players)
              if (Players[playerId].name == params[1]) {
                if (Players[playerId].password) {
                  if (params[2] == 'remove') {
                    delete Players[playerId].badge;
                    Players[playerId].verify = false; savePlayers();
                    socket.send(JSON.stringify([{ mainlog: `已经撤销 ${getPlayerDisplay(playerId)} 的认证。` }]));
                    return;
                  }
                  else {
                    Players[playerId].verify = true; savePlayers();
                    socket.send(JSON.stringify([{ mainlog: `已经给予 ${getPlayerDisplay(playerId)} 认证。` }]));
                    return;
                  }
                }
                else throw "该用户未设置密码。";
              }
            throw "找不到用户。";
          }
          throw "找不到指令。";
        }
      }
      if (data.type == "room") {
        isInRoom = true;
        if (allowSendInRoom(req.player) == 'notallow')
          throw "暂时不允许在此处发送信息。";
        var roomId = Players[req.player].room;
        GAME_MODE[Rooms[roomId].mode].getMessageInRoom(roomId, req.player, data.command);
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
    (html, tagName, fileName) => `<${tagName}> `
      + `${readFileSync(`ui/${fileName}`, 'utf8')}</${tagName}> `);
  return homeHtml;
}
app.get('/', (req, res) => {
  res.send(getHomeHtml());
});

var server = app.listen(2345, () => {
  logger.log(`Port ${server.address().port} is opened`);
});