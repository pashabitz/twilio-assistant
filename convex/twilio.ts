
import Twilio from "twilio_component";
import { action, components, internalAction } from "./_generated/server.js";
import { v } from "convex/values";
import { api } from "./_generated/api.js"
import OpenAI from "openai";
const openai = new OpenAI();

const twilio = new Twilio(
    components.twilio,
    {
        default_from: process.env.TWILIO_PHONE_NUMBER || "",
        incoming_message_callback: async (ctx, message) => {
            await ctx.runAction(api.twilio.getCompletionForIncomingMessage, { from: message.From });
        }
    }
);

export default twilio;


const makeCompletionMessages = (incomingMessages: any[], outgoingMessages: any[]) => {
    return incomingMessages.map((m: any) => {
        return {
            role: "user",
            content: m.Body,
            _creationTime: m._creationTime,
        };
    })
    .concat(outgoingMessages.map((m: any) => {
        return {
            role: "assistant",
            content: m.body.replace(/Sent from your Twilio trial account - /, ""),
            _creationTime: m._creationTime,
        };
    }))
    .sort((a: any, b: any) => {
        return a._creationTime - b._creationTime;
    })
    .map((m: any) => {
        delete m._creationTime;
        return m;
    });
};

export const getCompletionForIncomingMessage = action({
    args: {
        from: v.string(),
    },
    handler: async (ctx, args) => {
        const incomingMessages = await twilio.getIncomingMessagesByFrom(ctx, { from: args.from });
        const outgoingMessages = await twilio.getMessagesByTo(ctx, { to: args.from });
        
        const completionMessages = makeCompletionMessages(incomingMessages, outgoingMessages);

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

        return await twilio.sendMessage(ctx, {
            to: args.from,
            body: completion.choices[0].message.content!,
        });
    }
})

export const registerIncomingSmsHandler = internalAction({
    args: {},
    handler: async (ctx) => {
        return await twilio.registerIncomingSmsHandler(ctx, {
        sid: process.env.TWILIO_PHONE_NUMBER_SID || "",
        });
    },
});

export const sendSms = internalAction({
    args: {
        to: v.string(),
        body: v.string(),
    },
    handler: async (ctx, args) => {
        return await twilio.sendMessage(ctx, args);
    },
});