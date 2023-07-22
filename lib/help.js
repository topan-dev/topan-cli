module.exports = {
    main: [
        { mainlog: `执行 “help &lt;指令名称&gt;” 指令来获取一个指令的用法。` },
        { mainlog: `在下方输入框内输入指令后回车以执行指令。` },
        { mainlog: `可用指令：help set create join exit ` },
    ],
    help: [
        { mainlog: `恭喜你发现了彩蛋！` },
    ],
    set: [
        { mainlog: `用法：set &lt;name&gt;` },
        { mainlog: `使用该指令设置你的显示名称。` },
    ],
    create: [
        { mainlog: `创建一个房间。本指令无参数。` },
    ],
    join: [
        { mainlog: `用法：join &lt;room&gt;` },
        { mainlog: `加入一个房间。` },
    ],
    exit: [
        { mainlog: `退出当前房间。本指令无参数。` },
    ],
};