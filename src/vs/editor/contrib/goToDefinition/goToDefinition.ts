/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { flatten, coalesce } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { registerDefaultLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { Position } from 'vs/editor/common/core/position';
import { ITextModel } from 'vs/editor/common/model';
import { DefinitionLink, DefinitionProviderRegistry, ImplementationProviderRegistry, TypeDefinitionProviderRegistry } from 'vs/editor/common/modes';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IFileStat, FileKind } from 'vs/platform/files/common/files';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { OutlineElement } from 'vs/editor/contrib/documentSymbols/outlineModel';


function getDefinitions<T>(
	model: ITextModel,
	position: Position,
	registry: LanguageFeatureRegistry<T>,
	provide: (provider: T, model: ITextModel, position: Position) => DefinitionLink | DefinitionLink[] | Thenable<DefinitionLink | DefinitionLink[]>
): Thenable<DefinitionLink[]> {
	const provider = registry.ordered(model);

	// get results
	const promises = provider.map((provider): Thenable<DefinitionLink | DefinitionLink[]> => {
		return Promise.resolve(provide(provider, model, position)).then(undefined, err => {
			onUnexpectedExternalError(err);
			return null;
		});
	});
	return Promise.all(promises)
		.then(flatten)
		.then(references => coalesce(references));
}


export function getDefinitionsAtPosition(model: ITextModel, position: Position, token: CancellationToken): Thenable<DefinitionLink[]> {
	return getDefinitions(model, position, DefinitionProviderRegistry, (provider, model, position) => {
		return provider.provideDefinition(model, position, token);
	});
}

export function getImplementationsAtPosition(model: ITextModel, position: Position, token: CancellationToken): Thenable<DefinitionLink[]> {
	return getDefinitions(model, position, ImplementationProviderRegistry, (provider, model, position) => {
		return provider.provideImplementation(model, position, token);
	});
}

export function getTypeDefinitionsAtPosition(model: ITextModel, position: Position, token: CancellationToken): Thenable<DefinitionLink[]> {
	return getDefinitions(model, position, TypeDefinitionProviderRegistry, (provider, model, position) => {
		return provider.provideTypeDefinition(model, position, token);
	});
}

export class FileElement {
	constructor(
		readonly uri: URI,
		readonly kind: FileKind
	) { }
}

export function getCurrentFunctionAtPosition(model: ITextModel, position: Position, token: CancellationToken, tree: ITree, input: OutlineElement): Thenable<DefinitionLink[]> {
	let selection = (tree, input) => {
		let { uri } = (input as FileElement);
		let nav = tree.getNavigator();
		while (nav.next()) {
			let cur = nav.current();
			let candidate = IWorkspaceFolder.isIWorkspaceFolder(cur) ? cur.uri : (cur as IFileStat).resource;
			if (isEqual(uri, candidate)) {
				return cur;
			}
		}
		return undefined;
	};
	if (selection) {
		tree.reveal(selection, .5).then(() => {
			tree.setFocus(selection);
			tree.domFocus();
		});
	}
	return new Promise(undefined);
}

registerDefaultLanguageCommand('_executeDefinitionProvider', (model, position) => getDefinitionsAtPosition(model, position, CancellationToken.None));
registerDefaultLanguageCommand('_executeImplementationProvider', (model, position) => getImplementationsAtPosition(model, position, CancellationToken.None));
registerDefaultLanguageCommand('_executeTypeDefinitionProvider', (model, position) => getTypeDefinitionsAtPosition(model, position, CancellationToken.None));
