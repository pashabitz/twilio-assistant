import twilioClient from "@get-convex/twilio";
import { action, components, internalAction } from "./_generated/server.js";
import { v } from "convex/values";
import { api } from "./_generated/api.js"
import OpenAI from "openai";
const openai = new OpenAI();

const twilio = twilioClient(
    components.component,
    {
        default_from: process.env.TWILIO_PHONE_NUMBER || "",
        incomingMessageCallback: async (ctx, message) => {
            await ctx.runAction(api.assistant.respondToIncomingMessage, { from: message.from });
        }
    }
);

export default twilio;


export const respondToIncomingMessage = action({
    args: {
        from: v.string(),
    },
    handler: async (ctx, args) => {
        const messages = await twilio.getMessagesByCounterparty(ctx, { counterparty: args.from });
        
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
        return await twilio.sendMessage(ctx, {
            to: args.from,
            body,
        });
    }
})

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
