import { Twilio, messageValidator } from "@convex-dev/twilio";
import { internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal, components } from "./_generated/api.js"
import OpenAI from "openai";
const openai = new OpenAI();

const twilio: any = new Twilio(
    components.twilio,
    {
        default_from: process.env.TWILIO_PHONE_NUMBER || "",
        incomingMessageCallback: internal.assistant.scheduleCompletionAndResponse,
    }
);
export default twilio;

export const responseToIncomingMessage = internalAction({
    args: {
        message: messageValidator,
    },
    handler: async (ctx, args) => {
        const messages = await twilio.getMessagesByCounterparty(ctx, { counterparty: args.message.from });
        
        const completionMessages = makeCompletionMessages(messages);

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: completionMessages,
        });

        if (completion.choices.length === 0) {
            return;
        }

        if (completion.choices[0].message.content === "") {
            return;
        }

        const body = completion.choices[0].message.content!.substring(0, 1600);
        await twilio.sendMessage(ctx, {
            to: args.message.from,
            body,
        });
    }
});

export const scheduleCompletionAndResponse = internalMutation({
    args: {
        message: messageValidator,
    },
    handler: async (ctx, args) => {
        await ctx.scheduler.runAfter(0, internal.assistant.responseToIncomingMessage, args);
    }
});

export const sendMessage = internalAction({
    args: {
        to: v.string(),
        body: v.string(),
    },
    handler: async (ctx, args) => {
        return await twilio.sendMessage(ctx, args);
    },
});

const makeCompletionMessages = (messages: any[]) => {
    return messages.map((m: any) => {
        return {
            role: m.direction === "incoming" ? "user" : "assistant",
            content: m.body,
            _creationTime: m._creationTime,
        };
    })
    .sort((a: any, b: any) => {
        return a._creationTime - b._creationTime;
    })
    .map((m: any) => {
        delete m._creationTime;
        return m;
    });
};

export const registerIncomingSmsHandler = internalAction({
    args: {},
    handler: async (ctx) => {
        return await twilio.registerIncomingSmsHandler(ctx, {
        sid: process.env.TWILIO_PHONE_NUMBER_SID || "",
        });
    },
});
