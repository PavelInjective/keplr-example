import {
  TxRaw,
  MsgSend,
  BaseAccount,
  TxRestClient,
  ChainRestAuthApi,
  createTransaction,
  CosmosTxV1Beta1Tx,
  BroadcastModeKeplr,
  ChainRestTendermintApi,
  getTxRawFromTxRawOrDirectSignResponse,
} from "@injectivelabs/sdk-ts";
import { getStdFee, DEFAULT_BLOCK_TIMEOUT_HEIGHT } from "@injectivelabs/utils";
import { ChainId } from "@injectivelabs/ts-types";
import { BigNumberInBase } from "@injectivelabs/utils";
import { TransactionException } from "@injectivelabs/exceptions";
import { SignDoc } from "@keplr-wallet/types";

const $window = window as any;

const getKeplr = async (chainId: string) => {
  await $window.keplr.enable(chainId);

  const offlineSigner = $window.keplr.getOfflineSigner(chainId);
  const accounts = await offlineSigner.getAccounts();
  const key = await $window.keplr.getKey(chainId);

  return { offlineSigner, accounts, key, sendTx: $window.keplr.sendTx };
};

const broadcastTx = async (chainId: string, txRaw: TxRaw) => {
  const keplr = await getKeplr(ChainId.Mainnet);
  const result = await keplr.sendTx(
    chainId,
    CosmosTxV1Beta1Tx.TxRaw.encode(txRaw).finish(),
    BroadcastModeKeplr.Sync
  );

  if (!result || result.length === 0) {
    throw new TransactionException(
      new Error("Transaction failed to be broadcasted"),
      { contextModule: "Keplr" }
    );
  }

  return Buffer.from(result).toString("hex");
};

(async () => {
  const chainId = "injective-1"; /* ChainId.Mainnet */
  const { key, offlineSigner } = await getKeplr(chainId);
  const pubKey = Buffer.from(key.pubKey).toString("base64");
  const injectiveAddress = key.bech32Address;
  const restEndpoint =
    "https://testnet.sentry.lcd.injective.network:443"; /* getNetworkEndpoints(Network.MainnetSentry).rest */
  const amount = {
    amount: new BigNumberInBase(0.01).toWei().toFixed(),
    denom: "inj",
  };

  /** Account Details **/
  const chainRestAuthApi = new ChainRestAuthApi(restEndpoint);
  const accountDetailsResponse = await chainRestAuthApi.fetchAccount(
    injectiveAddress
  );
  const baseAccount = BaseAccount.fromRestApi(accountDetailsResponse);

  /** Block Details */
  const chainRestTendermintApi = new ChainRestTendermintApi(restEndpoint);
  const latestBlock = await chainRestTendermintApi.fetchLatestBlock();
  const latestHeight = latestBlock.header.height;
  const timeoutHeight = new BigNumberInBase(latestHeight).plus(
    DEFAULT_BLOCK_TIMEOUT_HEIGHT
  );

  /** Preparing the transaction */
  const msg = MsgSend.fromJSON({
    amount,
    srcInjectiveAddress: injectiveAddress,
    dstInjectiveAddress: injectiveAddress,
  });

  /** Prepare the Transaction **/
  const { signDoc } = createTransaction({
    pubKey,
    chainId,
    fee: getStdFee({}),
    message: msg,
    sequence: baseAccount.sequence,
    timeoutHeight: timeoutHeight.toNumber(),
    accountNumber: baseAccount.accountNumber,
  });

  const directSignResponse = await offlineSigner.signDirect(
    injectiveAddress,
    signDoc as unknown as SignDoc
  );
  const txRaw = getTxRawFromTxRawOrDirectSignResponse(directSignResponse);
  const txHash = await broadcastTx(ChainId.Mainnet, txRaw);
  const response = await new TxRestClient(restEndpoint).fetchTxPoll(txHash);

  console.log(response);
})();
