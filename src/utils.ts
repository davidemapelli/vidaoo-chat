const delay = (milliseconds: number) => new Promise(res => setTimeout(res, milliseconds));

export { delay };