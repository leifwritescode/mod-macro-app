import {
    ConfigFormBuilder,
    Context,
    Devvit,
    KeyValueStorage,
    RedditAPIClient,
    UserContext,
} from '@devvit/public-api';

const keyValueStore = new KeyValueStorage();
const redditApiClient = new RedditAPIClient();

const keyBanBody: string = 'ban_body';
const keyRemovalBody: string = 'removal_body';
const defaultMacroNames: string[] = [ 'submission', 'subreddit', 'author', 'kind', 'mod', 'title', 'url', 'domain', 'link' ];

async function getRemovalMessage(defaultMacros: {[key: string]:string}) : Promise<string | undefined> {
    let removalBody = await keyValueStore.get<string>(keyRemovalBody);
    if (!removalBody) {
        return undefined;
    }

    const regex = /{(\w+)}/g;
    const macros = [... new Set(removalBody.match(regex))];
    for (const macro in macros) {
        let value: (string | undefined) = undefined;

        const defaultMacroKey = Object.keys(defaultMacros).find((f) => f === macro);
        if (!defaultMacroKey) {
            const customMacroValue = await keyValueStore.get<string>(macro);
            if (!customMacroValue) {
                console.log(`tried to replace ${macro} in reply body but it is not a valid macro`);
                continue;
            }
            else {
                value = customMacroValue;
            }
        }
        else {
            value = defaultMacros[macro];
        }

        if (value) {
            removalBody = removalBody!.replace(macro, value!);
        }
    }

    return removalBody;
}

Devvit.addAction({
    context: Context.POST,
    userContext: UserContext.MODERATOR,
    name: 'Remove with Macro',
    description: 'Remove this post, and leave a reply using pre-defined and custom macros.',
    handler: async (event, metadata?) => {
        let success: boolean = true;
        let message: string = 'Success! The post was removed, and a reply was sent.';

        const defaultMacros: {[key: string]:string} = {
            submission: event.post.body || 'undefined',
            subreddit: event.post.subreddit || 'undefined',
            author: event.post.author || 'undefined',
            kind: 'submission',
            mod: (await redditApiClient.getCurrentUser(metadata)).username,
            title: event.post.title || 'undefined',
            url: event.post.permalink ? `https://www.reddit.com/${event.post.permalink!}` : 'undefined',
            domain: event.post.url || 'undefined', // for now, just use whole link. needs a regex to extract
            link: event.post.url || 'undefined',
        };

        const removalBody = await getRemovalMessage(defaultMacros);
        if (!removalBody) {
            success = false;
            message = 'Cannot reply as the removal macro has not been set.';
            return { success, message };
        }

        const submission = await redditApiClient.getPostById(event.post.id!, metadata);
        const comment = await submission.addComment({ text: removalBody });
        await comment.distinguish(true);
        await submission.remove(false);

        return { success, message };
    },
});

Devvit.addAction({
    context: Context.COMMENT,
    userContext: UserContext.MODERATOR,
    name: 'Remove with Macro',
    description: 'Remove this comment, and leave a reply using pre-defined and custom macros.',
    handler: async (event, metadata) => {
        let success: boolean = true;
        let message: string = 'Success! The post was removed, and a reply was sent.';

        const defaultMacros: {[key: string]:string} = {
            submission: event.comment.body || 'undefined',
            subreddit: event.comment.subreddit || 'undefined',
            author: event.comment.author || 'undefined',
            kind: 'comment',
            mod: (await redditApiClient.getCurrentUser(metadata)).username,
            title: 'undefined',
            url: event.comment.permalink ? `https://www.reddit.com/${event.comment.permalink!}` : 'undefined',
            domain: 'undefined', // for now, just use whole link. needs a regex to extract
            link: 'undefined',
        };

        const removalBody = await getRemovalMessage(defaultMacros);
        if (!removalBody) {
            success = false;
            message = 'Cannot reply as the removal macro has not been set.';
            return { success, message };
        }

        const submission = await redditApiClient.getCommentById(event.comment.id!, metadata);
        const comment = await submission.reply({ text: removalBody });
        await comment.distinguish(false);
        await submission.remove(false);

        return { success, message };
    },
});

/*

Devvit.addAction({
    context: Context.POST,
    userContext: UserContext.MODERATOR,
    name: 'Ban with Macro',
    description: 'Remove this post, ban the user, and send a message using pre-defined and custom macros.',
    handler: async (event) => {
        const message = `Post action! Post ID: ${event.post?.id}`;
        console.log(message);
        return { success: true, message };
    },
});

Devvit.addAction({
    context: Context.COMMENT,
    userContext: UserContext.MODERATOR,
    name: 'Ban with Macro',
    description: 'Remove this comment, ban the user, and send a message using pre-defined and custom macros.',
    handler: async (event) => {
        const message = `Comment action! Comment ID: ${event.comment?.id}`;
        console.log(message);
        return { success: true, message };
    },
});

*/

Devvit.addAction({
    context: Context.SUBREDDIT,
    userContext: UserContext.MODERATOR,
    name: 'Set Removal Message',
    description: 'Configure the body text used for removals.',
    userInput: new ConfigFormBuilder()
        .textarea('custom_removal_message', 'Removal Message')
        .build(),
    handler: async (event) => {
        let success: boolean = true;
        let message: string = "Success! I've set the removal message to {value}";

        const value = event.userInput?.fields.find((f) => f.key === 'custom_removal_message')?.response || '';
        if (!value) {
            success = false;
            message = 'The message cannot be empty.';
            return { success, message };
        }

        await keyValueStore.put(keyRemovalBody, value);
        message = message.replace("{value}", value);
        return { success, message };
    },
});

Devvit.addAction({
    context: Context.SUBREDDIT,
    userContext: UserContext.MODERATOR,
    name: 'Set Ban Message',
    description: 'Configure the body text used for bans.',
    userInput: new ConfigFormBuilder()
        .textarea('custom_ban_message', 'Ban Message')
        .build(),
    handler: async (event) => {
        let success: boolean = true;
        let message: string = "Success! I've set the ban message to {value}";

        const value = event.userInput?.fields.find((f) => f.key === 'custom_ban_message')?.response || '';
        if (!value) {
            success = false;
            message = 'The message cannot be empty.';
            return { success, message };
        }

        await keyValueStore.put(keyBanBody, value);
        message = message.replace("{value}", value);
        return { success, message };
    },
});

Devvit.addAction({
    context: Context.SUBREDDIT,
    userContext: UserContext.MODERATOR,
    name: 'Set Custom Macro',
    description: 'Configure a custom macro, which will be substituted in ban/removal messages.',
    userInput: new ConfigFormBuilder()
        .textField('custom_macro_name', 'Macro name without curly braces (will be used as the key!)')
        .textField('custom_macro_content', 'Macro value (will be used to replace occurences of the key!)')
        .build(),
    handler: async(event) => {
        let success: boolean = true;
        let message: string = "Success! I've set {key} to {value}";

        const key = event.userInput?.fields.find((f) => f.key === 'custom_macro_name')?.response || '';
        if (!key) {
            success = false;
            message = 'The macro name cannot be empty.';
            return { success, message };
        }

        if (defaultMacroNames.find((f) => f === key) !== undefined) {
            success = false;
            message = 'Cannot overwrite a default macro.';
            return { success, message };
        }

        const value = event.userInput?.fields.find((f) => f.key === 'custom_macro_content')?.response || '';
        if (!value) {
            success = false;
            message = 'The macro content cannot be empty.';
            return { success, message };
        }

        await keyValueStore.put(key, value);
        message = message.replace("{key}", key).replace("{value}", value);
        return { success, message };
    }
});

export default Devvit;
