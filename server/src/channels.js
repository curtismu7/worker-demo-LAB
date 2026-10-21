// The ways a person reaches the agent, from the customer's requirements sheet. The channel is a front-end skin: the identity chain
// underneath is the same. `identity` is the sheet's own wording for what the channel must get right.
export const CHANNELS = [
  { id: 'teams', name: 'Microsoft Teams', how: 'The user asks through a Teams-based agent experience.', identity: 'Authenticate the user through Ping; preserve the user and session context when invoking downstream tools.' },
  { id: 'github', name: 'GitHub', how: 'The user invokes the agent from a pull request, issue or repository workflow.', identity: 'Confirm repository and organization access; use delegated, least-privilege access for code and pull-request context.' },
  { id: 'cowork', name: 'Claude Cowork', how: 'The user works with an agent through the approved Cowork experience.', identity: 'Authenticate the user and govern any delegated access to enterprise data or connected tools.' },
  { id: 'website', name: 'Website / web application', how: 'The user reaches an agent from an approved web experience.', identity: 'Authenticate through Ping and keep the user context through the agent session and tool calls.' },
  { id: 'hr-chatbot', name: 'HR chatbot (existing site)', how: 'An existing site already offers a Claude-powered HR chatbot (vacation requests). Ping adds sign-in and user context in front of it.', identity: 'The site keeps its own experience; the chatbot calls tools as the signed-in person, through the same policy point.' },
];
