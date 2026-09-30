async function carregarClientes(){
  const status=document.getElementById("status");
  const body=document.getElementById("clientsBody");
  const count=document.getElementById("clientCount");
  status.className="status";
  status.textContent="Consultando o banco da Tinhas…";
  body.innerHTML='<tr><td colspan="5">Carregando…</td></tr>';

  try{
    const response=await fetch(window.TINHAS_API_URL+"?acao=clientes");
    if(!response.ok) throw new Error("HTTP "+response.status);
    const result=await response.json();
    if(!result.sucesso) throw new Error(result.erro || "A API retornou um erro.");

    const clientes=result.dados?.clientes || [];
    count.textContent=clientes.length;
    body.innerHTML=clientes.length ? clientes.map(c=>`
      <tr>
        <td>${esc(c.id_cliente)}</td>
        <td>${esc(c.nome)}</td>
        <td>${esc(c.instagram)}</td>
        <td>${esc(c.cidade)}</td>
        <td>${esc(c.status)}</td>
      </tr>`).join("") : '<tr><td colspan="5">Nenhum cliente cadastrado.</td></tr>';

    status.className="status ok";
    status.textContent="Conexão com o banco funcionando.";
  }catch(error){
    status.className="status error";
    status.textContent="Não foi possível carregar os clientes: "+error.message;
    body.innerHTML='<tr><td colspan="5">Erro ao carregar.</td></tr>';
  }
}
function esc(value){
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[ch]));
}
document.getElementById("reloadBtn").addEventListener("click", carregarClientes);
carregarClientes();
