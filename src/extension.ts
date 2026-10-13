import * as vscode from 'vscode';
import { start } from './modern/runtime';
export async function activate(context: vscode.ExtensionContext) { return start(context); }
export function deactivate() {}
