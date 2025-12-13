case 'messages': {
  const { mountMessages } = await import(new URL('../Messages/Messages.js', baseURL));
  mountMessages(mainRoot);
  break;
}

