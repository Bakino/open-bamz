/*global view*/

view.loader = async ()=>{
    let plugins = await window.openbamz.queryGraphql(`query {
        all_openbamz_plugins {
            nodes {
            plugin_id
            }
        }
    }`, view.route.params.app)

    let pluginListResponse = await fetch(`/plugin_list`);
    let pluginList = await pluginListResponse.json() ;
    let installedPlugins = plugins?.data?.all_openbamz_plugins?.nodes?.map(p=>pluginList.find(plugin=>plugin.id === p.plugin_id));
    let notInstalledPlugins = pluginList.filter(p=>!installedPlugins.some(plugin=>plugin.id === p.id)) ;

    let data = {
        installedPlugins,
        notInstalledPlugins,
        pluginList,
        error: plugins.errors?.map(e=>e.messages).join(",")
    };
    return data;
}

view.deletePlugin = async (plugin)=>{
    const yes = await bootstrap5.dialogs.confirm({message: `Are you sure to remove the plugin ${plugin.name} ?`}) ;
    if(yes){
        waiter(async ()=>{
            let result = await window.openbamz.queryGraphql(`mutation MyMutation {
                delete_openbamz_plugins_by_plugin_id(input: {plugin_id: "${plugin.id}"}) {
                    clientMutationId
                }
            }`, view.route.params.app) ;
            if(result.errors){
                return bootstrap5.dialogs.error({message: "Unexpected error "+result.errors.map(e=>e.message).join("")}) ;
            }
            view.refresh() ;
        })
    }
}

view.addPlugin = async ()=>{
    if(!view.data.pluginToAdd){ return bootstrap5.dialogs.error({message: "Please choose a plugin"}) ; }
    if(view.data.installedPlugins.some(p=>p.id === view.data.pluginToAdd)){
        return bootstrap5.dialogs.error({message: "You already added this plugin"}) ;
    }

    waiter(async ()=>{
        let result = await window.openbamz.queryGraphql(`mutation MyMutation {
            create_openbamz_plugins(input: {openbamz_plugins: {plugin_id: "${view.data.pluginToAdd}"}}) {
                clientMutationId
            }
        }`, view.route.params.app) ;
        if(result.errors){
            return bootstrap5.dialogs.error({message: "Unexpected error "+result.errors.map(e=>e.message).join("")}) ;
        }
        view.data.pluginToAdd = null;
        view.refresh() ;
    })
}