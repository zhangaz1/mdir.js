import { strWidth } from "neo-blessed/lib/unicode";
import { DoData } from "./EditorClipboard";
import { File } from "../common/File";
import fs from "fs";
import { Logger } from "../common/Logger";
import { StringUtils } from "common/StringUtils";
import { StringLineToken } from '../common/StringUtils';

const log = Logger( "editor" );

interface IEditorBuffer {
    textLine ?: number;       // Text Position
    viewLine ?: number;       // screen view position
    nextLineNum ?: number;    // if over the one line, line number.
    isNext ?: boolean;        // Is this line over the one line?
    text ?: string;
};

interface IEditSelect {
    x1: number;
    y1: number; // select first position(x,y)
    x2: number; 
    y2: number; // select last position (x,y)
};

enum EDIT_MODE {
    EDIT,            /// Edit Mode
    SELECT,            /// Select Mode
    BLOCK,            /// Block Select Mode
    SHIFT_SELECT    /// Shift Mode
};

const TABCONVCHAR = " ";

export abstract class Editor {
    line: number = 0;
    column: number = 0;
    curColumnMax: number = 0;

    firstLine: number = 0;
    lastLine: number = 0;
    viewCol: number = 0;
    viewLine: number = 0;

    curLine: number = 0;
    curColumn: number = 0;

    isLineNumView: boolean = false;
    isInsert: boolean = false;
    isIndentMode: boolean = false;

    editMode: EDIT_MODE = EDIT_MODE.EDIT;
    editSelect: IEditSelect = null;

    lineWidth: number = 0;
    tabSize: number = 8;

    isReadOnly: boolean = false;
    isDosMode: boolean = false;

    title: string = "";
    encoding: string = "utf8";
    fileName: string = null;

    isBackup: boolean = false;

    findStr: string = "";
    indexFindPosX: number = 0;
    indexFindPosY: number = 0;

    viewBuffers: IEditorBuffer[];
    buffers: string[];
    doInfo: DoData[];

    constructor() {
        
    }

    destory() {
        this.doInfo = null;
    }

    abstract postLoad(): void;
    abstract postUpdateLines( line?: number, height?: number ): void;

    abstract inputBox(title, text): Promise<string>;
    abstract messageBox(title, text, buttons ?: [ string ]): Promise<string>;

    public selectSort(editSelect: IEditSelect) {

    }

    public selectDel() {

    }

    public screenMemSave( line: number, column: number ) {
        if ( this.curLine > 0 ) {
            if ( this.curLine >= this.buffers.length) this.curLine = this.buffers.length - 1;
            if ( this.curLine <= this.firstLine ) this.firstLine = this.firstLine - 1;
            if ( this.firstLine <= 0 ) this.firstLine = 0;
            if ( this.lastLine - this.firstLine >= 10 && this.lastLine - this.curLine <= 0 ) {
                if ( this.viewBuffers.length >= this.line ) {
                    if ( this.firstLine <= this.buffers.length ) {
                        this.firstLine++;
                    }
                    if ( this.buffers.length <= this.line - 5 ) {
                        this.firstLine = 0;
                    }
                }
            }
        }

        log.debug("firstLine [%d] [%d]", this.curLine, this.firstLine);

        let strLineToken = new StringLineToken();

        for(;;) {
            let viewLine = this.firstLine;
            if (viewLine < 0) return;
    
            this.viewBuffers = [];

            let isNext = false;
            
            for ( let t = 0; t < line; t++ ) {
                if ( !strLineToken.next(true) ) {
                    if ( viewLine >= this.buffers.length ) break;
                    strLineToken.setString( this.buffers[viewLine++], this.column );
                }

                isNext = strLineToken.size() - 1 !== strLineToken.curLine;

                let viewStr = strLineToken.get();

                let lineInfo: IEditorBuffer = {};
                lineInfo.viewLine = t;
                lineInfo.textLine = viewLine - 1;
                lineInfo.text = viewStr;
                lineInfo.isNext = isNext;
                lineInfo.nextLineNum = strLineToken.curLine;

                // let nLineBeginPos = lineInfo.nextLineNum * column;
                // let nLineEndPos = (lineInfo.nextLineNum * column) + column;                
                this.viewBuffers.push( lineInfo );
                strLineToken.next();
            }

            this.lastLine = viewLine - 1;

            if ( this.viewBuffers.length > line - 3 ) {
                if ( this.lastLine === this.curLine && this.viewBuffers[this.lastLine].isNext ) {
                    this.firstLine++;
                    continue;
                }
                if ( this.lastLine < this.curLine ) {
                    this.firstLine++;
                    continue;
                }
            }
            break;
        }
    }
    
    setViewTitle( title = "" ) {
        this.title = title;
    }

    setEditor( tabSize: 8, backup: false, isLineNumView: boolean ) {
        this.tabSize = tabSize;
        this.isBackup = backup;
        this.isLineNumView = isLineNumView;
    }

    newFile( fileName: string ) {
        this.fileName = fileName;
        this.buffers = [];
        this.encoding = "utf8";
        this.firstLine = 0;
        this.curLine = 0;
        this.curColumn = 0;
        this.curColumnMax = 0;
        this.isInsert = true;        
        this.findStr = "";
        this.indexFindPosX = 0;
        this.indexFindPosY = 0;
        this.doInfo = null;
    }

    load( file: string | File, isReadonly: boolean = false ): boolean {
        let fileName = (file instanceof File) ? file.fullname : file;
        if ( !fileName ) {
            return false;
        }

        this.newFile(fileName);

        let fsData = fs.readFileSync( fileName, this.encoding );
        if ( !fsData ) {
            return false;
        }
        let dosMode = false;
        fsData.split("\n").map( (item) => {
            item = this.tabToEdit( item, "\t", this.tabSize );
            let item2 = item.replace( new RegExp("\r"), "");
            if ( item2 !== item ) {
                dosMode = true;
            }
            this.buffers.push( item2 );
        });
        this.isDosMode = dosMode;
        this.postLoad();
        return true;
    }

    save( file: string | File, encoding: string = null, isBackup: boolean = false ): boolean {
        let fileName = (file instanceof File) ? file.fullname : file;
        if ( !fileName ) {
            return false;
        }

        let tmpFileName = fileName + ".tmp";

        try {
            fs.writeFileSync( tmpFileName, this.encoding, this.buffers.join( this.isDosMode ? "\r\n" : "\n" ) );
        } catch( e ) {
            log.error( e );
            return false;
        }

        if ( isBackup ) {
            try {
                fs.renameSync( fileName, fileName + ".back" );
            } catch( e ) {
                log.error( e );
            }
        }

        try {
            fs.renameSync( tmpFileName, fileName );
            fs.chmodSync( fileName, 0o644 );
        } catch( e ) {
            log.error( e );
            return false;
        }
        return true;
    }

    tabToEdit( text: string, tabChar: string, tabSize: number ): string {
        return text.replace( new RegExp(tabChar, "g"), tabChar.repeat(tabSize) );
    }

    editToTab( text: string, tabChar: string, tabSize: number ): string {
        return text.replace( new RegExp(tabChar, "g"), tabChar.repeat(tabSize) );
    }

    lineNumberView() {
        this.isLineNumView = !this.isLineNumView;
    }

    keyLeft() {
        if ( this.curColumn > 0 ) {
            let cul = 0;
            for ( let i = 0; i < this.tabSize; i++ ) {
                this.curColumn--;
                cul++;
                if ( this.curColumn <= 0 && TABCONVCHAR === StringUtils.scrSubstr(this.buffers[this.curLine], this.curColumn, 1 ) ) {
                    break;
                }
            }
            if ( cul != this.tabSize && cul > 1 ) {
                this.curColumn++;
            }
        } else if ( this.curLine > 0) {
            this.curColumn = strWidth(this.buffers[ --this.curLine ]);
        }
        this.keyPressCommon();
    }

    keyRight() {
        let str = this.buffers[this.curLine];
        let strlen = strWidth(str);
        if ( strlen > this.curColumn ) {
            for ( let i = 0; i < this.tabSize; i++ ) {
                this.curColumn++;
                if ( this.curColumn <= strlen ||
                    TABCONVCHAR === StringUtils.scrSubstr(str, this.curColumn, 1 ) ) {
                    break;
                }
                if ( i === 0 ) {
                    if ( TABCONVCHAR !== StringUtils.scrSubstr(str, this.curColumn - 1, 1 ) ) {
                        break;
                    }
                }
            }
        } else if ( strlen === this.curColumn && this.curLine !== this.buffers.length - 1 ) {
            this.curLine++;
            this.curColumn = 0;
        }
        this.keyPressCommon();
    }

    keyUp() {
        if ( this.curLine > 0 ) this.curLine--;

        if ( this.curColumnMax < this.curColumn ) {
            this.curColumnMax = this.curColumn;
        } else {
            this.curColumn = this.curColumnMax;
        }

        let strlen = strWidth(this.buffers[this.curLine]);
        if ( strlen < this.curColumn ) {
            this.curColumn = strlen;
        } else {
            this.keyRight();
            this.keyLeft();
        }

        this.editSelect.x2 = this.curColumn;
        this.editSelect.y2 = this.curLine;
        if ( this.editMode === EDIT_MODE.SHIFT_SELECT ) this.editMode = EDIT_MODE.EDIT;
    }

    keyDown() {

    }

    keyShiftLeft() {}
    keyShiftRight() {} 
    keyShiftUp() {}
    keyShiftDown() {}

    keyInsert() {
        this.isInsert = !this.isInsert;
    }

    keyDelete() {
        if ( this.isReadOnly ) return;

        if ( this.editMode !== EDIT_MODE.EDIT ) {
            this.selectDel();
            this.editMode = EDIT_MODE.EDIT;
        }

        let line = this.buffers[this.curLine];
        if ( this.curColumn < strWidth(line) ) {
            this.doInfo.push( new DoData(this.curLine, this.curColumn, [ line ]));

            let temp = StringUtils.scrSubstr(line, this.curColumn, this.tabSize);
            line = StringUtils.scrStrReplace(this.buffers[this.curLine], this.curColumn, temp === TABCONVCHAR.repeat(temp.length) ? temp.length : 1);
            
            this.buffers[this.curLine] = line;
            this.postUpdateLines(this.curLine);
        } else if ( this.curLine + 1 < this.buffers.length ) {
            let line2 = this.buffers[this.curLine + 1];
            this.doInfo.push( new DoData(this.curLine, this.curColumn, [ line2 ] ));

            this.buffers[this.curLine] = line + line2;
            this.buffers.splice( this.curLine, 1 );
            this.postUpdateLines(this.curLine);
        }
        this.curColumnMax = this.curColumn;

        if ( this.buffers.length === 0 ) {
            this.buffers.push( "" );
        }
    }

    keyBS() {
        if ( this.isReadOnly ) return;

        if ( this.editMode !== EDIT_MODE.EDIT ) {
            this.selectDel();
            this.editMode = EDIT_MODE.EDIT;

            this.curLine = this.editSelect.y1;
            this.curColumn = this.editSelect.x1;
            this.curColumnMax = this.curColumn;
        }

        if ( this.curLine === 0 && this.curColumn === 0 ) return;

        if ( this.buffers.length > this.curLine ) {
            let line = this.buffers[this.curLine];

            let line2;
            if ( this.curColumn === 0 && this.buffers.length > 0 && this.curLine > 0 ) {
                line2 = this.buffers[this.curLine - 1];
                this.doInfo.push( new DoData(this.curLine - 1, this.curColumn, [ line2, line ] ));

                let tmpLine2Width = strWidth( line2 );
                this.buffers[ this.curLine - 1 ] = line2 + line;
                this.buffers.splice( this.curLine, 1 );

                this.postUpdateLines(this.curLine);
                this.keyUp();
                this.curColumn = tmpLine2Width;
            } else {
                let strSize = strWidth( this.buffers[ this.curLine ] );
                if ( this.curColumn <= strSize ) {
                    this.doInfo.push( new DoData(this.curLine, this.curColumn, [ line ] ));

                    let tabCheck = "";
                    if ( this.curColumn - this.tabSize >= 0 ) {
                        tabCheck = StringUtils.scrSubstr(this.buffers[this.curLine], this.curColumn - this.tabSize, this.tabSize);
                    } else {
                        tabCheck = StringUtils.scrSubstr(this.buffers[this.curLine], 0, this.curColumn);
                    }
                    if ( tabCheck === TABCONVCHAR.repeat(tabCheck.length) ) {
                        line2 = StringUtils.scrStrReplace(this.buffers[this.curLine], this.curColumn - tabCheck.length, tabCheck.length);
                        this.curColumn -= tabCheck.length;
                    } else {
                        line2 = StringUtils.scrStrReplace(this.buffers[this.curLine], this.curColumn - 1, 1);
                        this.curColumn -= 1;
                    }
                }
            }
            this.buffers[ this.curLine ] = line2;
            this.postUpdateLines( this.curLine );

            this.editSelect.x2 = this.curColumn;
            this.editSelect.y2 = this.curLine;
        }
        this.curColumnMax = this.curColumn;
    }

    keyTab() {
        if ( this.isReadOnly ) return;

        if ( this.editMode !== EDIT_MODE.EDIT ) {
            const tabStr = TABCONVCHAR.repeat(this.tabSize);

            this.selectSort( this.editSelect );

            let save: string[] = [];
            for ( let y = this.editSelect.y1; y <= this.editSelect.y2; y++ ) {
                save.push( this.buffers[ y ] );
            }
            this.doInfo.push( new DoData(this.editSelect.y1, 0, save, -1 ));
            
            for ( let y = this.editSelect.y1; y <= this.editSelect.y2; y++ ) {
                this.buffers[y] = tabStr + this.buffers[y];
            }

            this.postUpdateLines( this.editSelect.y1, this.editSelect.y2 - this.editSelect.y1 + 1);
            this.screenMemSave( this.line, this.column );
        }

        let tabSize = 4 - (this.curColumn % 4);
        this.inputData( TABCONVCHAR.repeat(tabSize) );
        this.screenMemSave( this.line, this.column );
    }

    keyUntab() {
        if ( this.isReadOnly ) return;

        if ( this.editMode !== EDIT_MODE.EDIT ) {
            const tabStr = TABCONVCHAR.repeat(this.tabSize);

            this.selectSort( this.editSelect );

            let save: string[] = [];
            for ( let y = this.editSelect.y1; y <= this.editSelect.y2; y++ ) {
                save.push( this.buffers[ y ] );
            }
            this.doInfo.push( new DoData(this.editSelect.y1, 0, save, -1 ));

            for ( let y = this.editSelect.y1; y <= this.editSelect.y2; y++ ) {
                if ( tabStr === this.buffers[y].substr(0, tabStr.length) ) {
                    this.buffers[y] = this.buffers[y].substr(tabStr.length);
                }
            }
        }
        this.screenMemSave( this.line, this.column );
    }

    indentMode() {
        this.isIndentMode = !this.indentMode;
    }

    inputData( textStr: string ) {
        if ( this.isReadOnly ) return;

        if ( this.editMode !== EDIT_MODE.EDIT ) {
            this.selectDel();
            this.editMode = EDIT_MODE.EDIT;
        }

        if ( this.curLine < this.buffers.length ) {
            let line = this.buffers[this.curLine];
            this.doInfo.push( new DoData(this.curLine, this.curColumn, [line]) );

            if ( this.isInsert ) {
                line = StringUtils.scrSubstr( line, 0, this.curColumn) + textStr + StringUtils.scrSubstr( line, this.curColumn );
            } else {
                line = StringUtils.scrSubstr( line, 0, this.curColumn) + textStr + StringUtils.scrSubstr( line, this.curColumn + strWidth(textStr) );
            }
            this.buffers[this.curLine] = line;
            this.curColumn += strWidth(textStr);
        }
        this.curColumnMax = this.curColumn;
    }
        
    keyHome() {
        let line = this.buffers[this.curLine];
        let ne = 0, old = this.curColumn;
        for ( let n = 0; n < line.length; n++ ) {
            if (line[n] !== ' ' && line[n] !== TABCONVCHAR) {
                ne = n;
                break;
            }
        }
        this.curColumn = old === ne ? 0 : ne;
        this.keyPressCommon();
    }

    keyEnd() {
        this.curColumn = strWidth( this.buffers[this.curLine] );
        this.keyPressCommon();
    }

    keyPgUp() {}
    keyPgDn() {}
    
    keyEnter() {
        if ( this.isReadOnly ) return;

        if ( this.editMode !== EDIT_MODE.EDIT ) {
            this.selectDel();
            this.editMode = EDIT_MODE.EDIT;
        }

        let line = this.buffers[this.curLine];
        let p1 = "";
        if ( this.indentMode ) {
            for ( let n = 0; n < line.length; n++ ) {
                if (line[n] !== ' ' && line[n] !== TABCONVCHAR) {
                    p1 = line.substr(0, n);
                    break;
                }
            }
        }

        this.doInfo.push( new DoData(this.curLine, this.curColumn, [line], 2) );

        if ( this.buffers.length > this.curLine ) {
            this.buffers[this.curLine] = StringUtils.scrSubstr(line, 0, this.curColumn);
            let line3 = p1 + StringUtils.scrSubstr(line, this.curColumn);
            this.buffers.splice( this.curLine, 0, line3 );
            this.postUpdateLines(this.curLine);
        } else {
            this.buffers.push(p1);
            this.screenMemSave( this.line, this.column );
        }
        this.curColumn = p1.length;
        this.curColumnMax = this.curColumn;
        this.keyDown();
    }

    keyMouse() {}
    
    async gotoLinePromise() {
        const result = await this.inputBox( "Go to Line Number", "Enter the line number to move." );
        let number = -1;
        try {
            number = parseInt( result );
        } catch ( e ) {
            await this.messageBox( "ERROR", "Invalid input number" );
        }
        if ( number > -1 && number < this.buffers.length ) {
            this.curLine = number - 1;
            if ( this.curLine <= 0 ) this.curLine = 0;
            this.firstLine = this.curLine - 10;
            if ( this.firstLine <= 0 ) this.firstLine = 0;
        } else {
            this.curLine = this.buffers.length - 1;
            this.firstLine = this.curLine - 10;
        }
        this.editMode = EDIT_MODE.EDIT;
    }

    gotoFirst() {
        this.curLine = 0;
        this.firstLine = 0;
        this.editMode = EDIT_MODE.EDIT;
    }

    gotoEnd() {
        this.curLine = this.buffers.length - 1;
        this.firstLine = this.curLine - 10;
        this.editMode = EDIT_MODE.EDIT;
    }
    
    copy() {

    }

    cut() {

    }

    paste() {

    }

    undo() {
        
    }

    keyEscape() {

    }

    select() {

    }

    selectAll() {

    }

    blockSelct() {

    }

    fileNew() {

    }

    fileSave() {

    }

    fileSaveAs() {

    }

    find() {

    }

    findNext() {

    }

    filePrevios() {

    }

    quit() {

    }

    isEditMode() {
        return this.editMode === EDIT_MODE.EDIT;
    }

    keyPressCommon() {
        this.editSelect.x2 = this.curColumn;
        this.editSelect.y2 = this.curLine;
        this.curColumnMax = this.curColumn;
        if ( this.editMode === EDIT_MODE.SHIFT_SELECT ) {
            this.editMode = EDIT_MODE.EDIT;
        }
    }
};
