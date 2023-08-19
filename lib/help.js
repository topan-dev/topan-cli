const { readdirSync } = require('fs');
const icons = readdirSync('ui/icon').map(filename => filename.split('.')[0]);

module.exports = {
    main: [
        { mainlog: `执行 “help &lt;指令名称&gt;” 指令来获取一个指令的用法。` },
        { mainlog: `在下方输入框内输入指令后回车以执行指令。` },
        { mainlog: `可用指令：help chat set setbadge setpass login create join exit result` },
    ],
    help: [
        { mainlog: `恭喜你发现了彩蛋！` },
    ],

    chat: [
        { mainlog: `用法：chat &lt;content&gt;` },
        { mainlog: `也可以直接在输入框中输入内容。当第一个空格之前的部分不是小写英文字母组成的字符串时自动识别为 chat 指令。` },
        { mainlog: `输入 “/<表情名称>” 插入表情，连续多个表情应使用空格隔开，使用 “help .icon” 查看所有可用表情。` },
    ],

    set: [
        { mainlog: `用法：set &lt;name&gt;` },
        { mainlog: `使用该指令设置你的显示名称。` },
    ],
    setbadge: [
        { mainlog: `用法：setbadge &lt;badge&gt;` },
        { mainlog: `使用该指令设置你的 Badge。` },
    ],
    setpass: [
        { mainlog: `在控制台输入 “SetPassword("passwordpassword");” 设置密码。` },
        { mainlog: `由于登录方式原因，请不要使用您的常用账号密码。` },
    ],
    login: [
        { mainlog: `在控制台输入 “Login("username","passwordpassword");” 登录。` },
        { mainlog: `若账号没有设置过密码，则不能通过此方式登录。` },
    ],

    create: [
        { mainlog: `用法：set &lt;人数&gt; &lt;模式&gt;` },
        { mainlog: `人数必须为 >= 2 的整数，附加限制见玩法具体规则。` },
        { mainlog: `模式必须为 hupai，gandengyan，whoiswodi，plane 之一。` },
        { mainlog: `使用 “help mode.&lt;模式&gt;” 查看该模式的游戏规则。` },
    ],
    join: [
        { mainlog: `用法：join &lt;room&gt;` },
        { mainlog: `加入一个房间。` },
    ],
    exit: [
        { mainlog: `退出当前房间。本指令无参数。` },
    ],
    result: [
        { mainlog: `用法：join &lt;room&gt;` },
        { mainlog: `导出一个房间的游戏记录。` },
    ],

    '.icon': [
        { mainlog: `可用表情：${icons.join(' ')}` },
    ],

    'mode.hupai': [
        { mainlog: `该玩法适用 >= 2 人的牌桌。` },
        { mainlog: `游戏开始时，按照游戏总人数，每三个人 1 副牌，向上取整，求得总牌副数。` },
        { mainlog: `每副牌包含两张王（S），3456789，10（显示为 0），JQKA2 各 4 张。` },
        { mainlog: `按照每人 18 张牌发牌，发牌完全随机，多余牌立即丢弃。` },
        { mainlog: `游戏过程中玩家只能看到自己的手牌以及他人手牌数量。` },
        { mainlog: `游戏分为若干回合。发牌结束，随机选择一名玩家作为第一回合的首位出牌者，并且第一回合立刻开始。` },
        { mainlog: `轮到一名玩家出牌时，该玩家有 3 种选择方案。` },
        { mainlog: `（A）向服务器提供两组牌：真实出的牌 和 向其他玩家显示的牌。` },
        { mainlog: `这两组牌的数量必须相同。真实出的牌必须是手牌的任意一个非空子集。向其他玩家显示的牌的每张牌必须相同，不能包含王。` },
        { mainlog: `若将真实出的牌中的王全部替换为另一张牌，能够使得两组牌相同，则称这次出牌为真的，反之称为假的。` },
        { mainlog: `真实出的牌仅自己可见，而向其他玩家显示的牌全员可见。` },
        { mainlog: `（B）跳过出牌阶段。` },
        { mainlog: `本方案不能在回合第一次出牌时选择。` },
        { mainlog: `连续 n-1（n 为玩家总数）个人跳过出牌阶段时，该回合结束，回合中出的所有牌丢弃，由上一次出牌的玩家作为下一回合的首位出牌者。` },
        { mainlog: `（C）检验上一位出牌者的真实性。` },
        { mainlog: `本方案不能在回合第一次出牌时选择。` },
        { mainlog: `若上一次出牌是真的，那么检验者必须收下本回合中所有玩家出的所有牌。` },
        { mainlog: `反之，被检验者必须收下本回合中所有玩家出的所有牌。` },
        { mainlog: `检验完成后，当前回合结束，新回合开始。由检验者作为下一回合的首位出牌者。` },
        { mainlog: `<strong>游戏结束与附加规则</strong>` },
        { mainlog: `游戏结束判定：一个玩家出完手牌，并且有下一位玩家跟牌或者检验失败，或者连续 n-1 人跳过出牌阶段后，游戏结束，出完手牌的玩家获胜。` },
        { mainlog: `附加规则：` },
        { mainlog: `1. 为了方便代码判定游戏结束，系统只会在轮到一名玩家出牌时判定手牌数量是否为 0。` },
        { mainlog: `若游戏已经结束但是没有立刻关闭房间，请所有玩家跳过出牌阶段。` },
        { mainlog: `2. 为了防止玩家出光自己手牌但是明显是假的，浪费游戏时间，系统只允许每次出不超过 6 张的手牌。` },
    ],
    'mode.gandengyan': [
        { mainlog: `正在完善中。` },
    ],
    'mode.whoiswodi': [
        { mainlog: `适用 >= 4 人（包含裁判）游戏。` },
        { mainlog: `第一个加入房间（一般为创建者）的人是裁判。若其退出，则为第二个加入房间的，以此类推。` },
        { mainlog: `随机从非裁判中选择一个玩家作为卧底。裁判给出两个词分别作为普通玩家的词语和卧底的词语。` },
        { mainlog: `描述阶段，存活的玩家按照加入房间顺序，依次描述自己的词语。` },
        { mainlog: `描述禁止出现词语中的字或用其他语言翻译，不能说假话。` },
        { mainlog: `由裁判审核后再显示给其他玩家，否则打回给当前玩家。` },
        { mainlog: `描述完成后，所有玩家投票选出心中的卧底。` },
        { mainlog: `若最高票数存在平票，就进入下一回合发言，否则淘汰最高票数。` },
        { mainlog: `连续 3 回合无人被淘汰判定为平局。若卧底淘汰则普通玩家胜，若普通玩家全部淘汰则卧底胜。` },
    ],
    'mode.plane': [
        { mainlog: `适用 >= 2 人游戏。` },
        { mainlog: `给定 10x10 方格图，列用小写字母 a~j 编号，行用数字 0~9 编号。` },
        { mainlog: `有如下飞机图形：` },
        { mainlog: `    *`.replace(/ /g, '&nbsp') },
        { mainlog: `    *   *`.replace(/ /g, '&nbsp') },
        { mainlog: `< * * * *`.replace(/ /g, '&nbsp') },
        { mainlog: `    *   *`.replace(/ /g, '&nbsp') },
        { mainlog: `    *`.replace(/ /g, '&nbsp') },
        { mainlog: `游戏开始时，所有玩家需要设定己方三架飞机的位置，飞机不能重叠。` },
        { mainlog: `设置完成后，按照加入房间的顺序，依次进行一次操作：` },
        { mainlog: `1. 询问方格类型：可以询问一个玩家的方格类型` },
        { mainlog: `飞机星号为机身，箭头为机头，如没有飞机覆盖，告知空白。` },
        { mainlog: `2. 尝试轰炸飞机：轰炸一个玩家的飞机` },
        { mainlog: `需要给出飞机机头位置与方向，若正确则轰炸成功，否则告知失败。` },
        { mainlog: `若轰炸成功，还可以进行下一次轰炸直到失败。` },
        { mainlog: `当一个玩家的三架飞机全部被轰炸，该玩家出局。` },
    ],

    'mode.hupai.tip': [
        { roomlog: `本局游戏采用 <strong>胡牌</strong> 规则。` },
        { roomlog: `跳过输入 “pass”；翻牌输入 “check”；` },
        { roomlog: `出牌输入 “<真实出的牌> <向其他玩家显示的牌>”。` },
    ],
    'mode.gandengyan.tip': [
    ],
    'mode.whoiswodi.tip': [
        { roomlog: `本局游戏采用 <strong>谁是卧底</strong> 规则。` },
        { roomlog: `对于裁判：` },
        { roomlog: `1. 设置答案：<普通玩家的词语> <卧底的词语> <卧底用户名（可选）>` },
        { roomlog: `2. 审核描述：` },
        { roomlog: `打回：<玩家用户名> 0 <备注：可选，被打回用户可见>` },
        { roomlog: `通过：<玩家用户名> 1` },
        { roomlog: `对于玩家：` },
        { roomlog: `1. 提交描述：直接输入即可。` },
        { roomlog: `2. 投票：输入用户名或者输入 pass。` },
    ],
    'mode.plane.tip': [
        { roomlog: `本局游戏采用 <strong>打飞机</strong> 规则。` },
        { roomlog: `<strong>坐标</strong>` },
        { roomlog: `坐标格式：<列编号（小写字母）><行编号（数字）><方向（LRUD，如果描述的是飞机，就需要此项）>` },
        { roomlog: `坐标示例：d7 | i3R` },
        { roomlog: `设置飞机位置：三架飞机的坐标，空格隔开` },
        { roomlog: `询问方格类型：<用户名> <坐标>` },
        { roomlog: `尝试轰炸飞机：<用户名> <飞机坐标>` },
    ],
};