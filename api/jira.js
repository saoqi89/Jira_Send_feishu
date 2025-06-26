const axios = require('axios');

// !!! 重要：将下面的 YOUR_FEISHU_HOOK_URL 替换为您在第一步中从飞书获取的 Webhook 地址
const FEISHU_WEBHOOK_URL = 'https://open.feishu.cn/open-apis/bot/v2/hook/fff55309-dd52-4127-b32f-7996ef76e6be';

/**
 * Vercel Serverless Function to handle Jira Webhooks.
 * @param {import('@vercel/node').VercelRequest} request
 * @param {import('@vercel/node').VercelResponse} response
 */
export default async function handler(request, response) {
    // 只接受 POST 请求
    if (request.method !== 'POST') {
        return response.status(405).send('Method Not Allowed');
    }

    try {
        const jiraPayload = request.body;

        // 1. 筛选出问题更新事件
        if (jiraPayload.webhookEvent !== 'jira:issue_updated') {
            return response.status(200).send('Event ignored: Not an issue update.');
        }

        // 2. 从数据中解析出状态变更的详情
        const changelog = jiraPayload.changelog;
        const statusChange = changelog?.items?.find(item => item.field?.toLowerCase() === 'status');

        // 如果没有状态变更，则忽略
        if (!statusChange) {
            return response.status(200).send('No status change detected.');
        }

        // 3. 提取所需信息用于构建消息
        const issue = jiraPayload.issue;
        const user = jiraPayload.user;
        const issueKey = issue.key;
        const summary = issue.fields.summary;
        // 拼接Jira任务链接
        const issueLink = `${issue.self.split('/rest/api/')[0]}/browse/${issueKey}`;
        const userName = user?.displayName || '未知用户';
        const fromStatus = statusChange.fromString;
        const toStatus = statusChange.toString;

        // 4. 构建飞书卡片消息（比纯文本更美观）
        const feishuCard = {
            "msg_type": "interactive",
            "card": {
                "config": { "wide_screen_mode": true },
                "header": {
                    "title": { "tag": "plain_text", "content": `Jira 任务状态更新` },
                    "template": "blue"
                },
                "elements": [
                    { "tag": "div", "text": { "tag": "lark_md", "content": `**[${issueKey}] ${summary}**` } },
                    { "tag": "hr" },
                    {
                        "tag": "div",
                        "fields": [
                            { "is_short": true, "text": { "tag": "lark_md", "content": `**操作人**\n${userName}` } },
                            { "is_short": true, "text": { "tag": "lark_md", "content": `**状态变更**\n\`${fromStatus}\` → \`${toStatus}\`` } }
                        ]
                    },
                    {
                        "tag": "actions",
                        "actions": [{ "tag": "button", "text": { "tag": "plain_text", "content": "查看Jira任务" }, "url": issueLink, "type": "primary" }]
                    }
                ]
            }
        };

        // 5. 将格式化后的消息发送到飞书机器人
        await axios.post(FEISHU_WEBHOOK_URL, feishuCard);

        // 6. 向 Jira 返回成功响应
        return response.status(200).send('Notification sent to Feishu successfully.');

    } catch (error) {
        console.error('Error processing Jira webhook:', error.message);
        return response.status(500).send('Internal Server Error');
    }
}
