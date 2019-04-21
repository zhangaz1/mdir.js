import * as blessed from "blessed";
import { BlessedProgram, Widgets, box, text, colors } from "blessed";
import { Logger } from "./common/Logger";
import { Colorizer } from "logform";
import { BlessedPanel } from "./panel_blassed/BlessedPanel";

const log = Logger("main");
// const program: BlessedProgram = blessed.program();

/*
program.alternateBuffer();
program.enableMouse();
program.hideCursor();
program.clear();

program.on("keypress", (ch, key) => {
    if (key.name === "q") {
        program.clear();
        program.disableMouse();
        program.showCursor();
        program.normalBuffer();
        process.exit(0);
    }
});

program.move(5, 5);
program.write("Hello world");
program.move(10, 10);
*/

const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    dockBorders: true,
    ignoreDockContrast: true
});

(async () => {
    const testPanel = new BlessedPanel( screen );
    testPanel.initReader("file");

    screen.key("q", () => {
        process.exit(0);
    });

    await testPanel.read( "." );

    screen.render();
})();
