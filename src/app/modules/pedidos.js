const database = require('../database/index')
const bling = require('../api/index')
const listaModule = require('./listas');
const itensModule = require('./itens');

module.exports = {
    async get(params) {
        const { idLista, situacao, chavedeacesso, pedido } = params

        let myquery = `SELECT * FROM pedidos `

        if (situacao != undefined && idLista != undefined) myquery += `where situacao='${situacao}' and idLista=${idLista}`;
        else if (idLista != undefined) myquery += `where idLista=${idLista}`;
        else if (pedido != undefined) myquery += `where pedido='${pedido}'`;
        else if (situacao != undefined) myquery += `where situacao='${situacao}'`;
        else if (chavedeacesso != undefined) myquery += `where chavedeacesso='${chavedeacesso}'`; //Pedidos's ID

        const db = await database()
        const [response] = await db.query(myquery)
        if (params.itens === 'true') {
            for (let i = 0; i < response.length; i++) {
                const itens = await itensModule.get(response[i])
                response[i].itens = itens
            }
        }
        db.end()
        return response
    },
    async post(params) {
        const { numPedido } = params
        const pedido = await bling(numPedido)

        if (pedido.erros) return pedido;
        if (pedido.integracao == "AmazonFulfillment") return "Problema no pedido" + numPedido

        const db = await database()

        const correios = ["Olist", "SkyHub", "Kabum"];

        async function idLista(db, integracao) { //Retorna o id da lista para realizar o post, sempre sera o que estiver disponivel
            // Comentario abaixo para visualizar o funcionamento das chegadas de requisi;'ao
            if (correios.indexOf(integracao) > -1) {

                const [response] = await db.query(`SELECT * FROM principal WHERE situacao = 'criar' and canal = 'Correios'`)
                if (response[0]) return response[0].id

                await listaModule.post({ canal: "Correios" }) //Caso não tenha uma referente a este marketplace nós iremos criar um com esse canal
                const [newResponse] = await db.query(`SELECT * FROM principal WHERE situacao = 'criar' and canal = 'Correios'`)
                return newResponse[0].id

            } else {
                const [response] = await db.query(`SELECT * FROM principal WHERE situacao = 'criar' and canal = '${integracao}'`)
                if (response[0]) return response[0].id

                await listaModule.post({ canal: integracao }) //Caso não tenha uma referente a este marketplace nós iremos criar um com esse canal
                const [newResponse] = await db.query(`SELECT * FROM principal WHERE situacao = 'criar' and canal = '${integracao}'`)
                console.log(response, newResponse)
                return newResponse[0].id
            }
        }
        pedido.idLista = await idLista(db, pedido.integracao)

        const response = await db.query(
            `INSERT INTO pedidos
            (chavedeacesso, nf, serie, idLista, pedidoBling, pedido, integracao, qntItens)
            VALUES
            ('${pedido.chavedeacesso}', '${pedido.nf}', ${pedido.serie}, ${pedido.idLista}, '${pedido.pedidoBling}', '${pedido.pedido}','${pedido.integracao}', ${pedido.qntItens})
        `)

        await itensModule.post(pedido)
        db.end()

        return pedido
    },
    async put(params) {
        const { chavedeacesso, situacao } = params
        const db = await database()

        let myquery = `UPDATE pedidos SET situacao = "${situacao.toLowerCase()}" WHERE chavedeacesso = "${chavedeacesso}"`
        const [response] = await db.query(myquery)

        const [newRes] = await db.query(`SELECT * FROM pedidos WHERE chavedeacesso = "${chavedeacesso}"`)
        const idLista = newRes[0].idLista

        const [count] = await db.query(`SELECT COUNT(*) FROM pedidos WHERE idLista = ${idLista}`)
        const [res] = await db.query(`SELECT COUNT(*) FROM pedidos WHERE situacao="Embalado" AND idLista = ${idLista}`)

        if (count[0]['COUNT(*)'] === res[0]['COUNT(*)']) {
            await db.query(`UPDATE pedidos SET situacao = "Finalizado" WHERE situacao="Embalado" AND idLista=${idLista}`)
            await db.query(`UPDATE principal SET situacao = "Finalizado" WHERE id=${idLista}`)
        }

        db.end()
        return { response }
    }
}
