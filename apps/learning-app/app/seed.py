def concept(id, title, x, y, requires=None, state='unexplored', summary=''):
    return dict(id=id, title=title, x=x, y=y, requires=requires or [], state=state, summary=summary, confidence='Not assessed', evidence='', notes='')


def seed():
    return dict(trees=[
        dict(id='ml', title='Machine learning foundations', category='Computer Science / Artificial Intelligence', goal='Explain how models learn, evaluate their predictions, and discuss the core ML vocabulary.', depth='Conversational fluency', status='active', excludes='Advanced proofs, production deployment, and reinforcement learning.', outcomes=['Explain training and evaluation', 'Compare underfitting and overfitting', 'Describe gradient descent in your own words'], concepts=[
            concept('models','Data & models',70,190,state='introduced',summary='Models learn patterns from examples to make predictions on unseen data.'),
            concept('loss','Loss functions',310,110,['models'],summary='A loss function measures how far a prediction is from the target.'),
            concept('evaluation','Train & test',310,300,['models'],summary='Held-out data helps estimate how a model performs on new examples.'),
            concept('gradient','Gradient descent',550,110,['loss'],summary='Update parameters in the direction that reduces the loss locally.'),
            concept('overfitting','Overfitting',550,300,['evaluation'],summary='A model can fit its training examples while failing to generalize.'),
            concept('rate','Learning rates',790,70,['gradient'],summary='The learning rate controls the size of each parameter update.'),
            concept('networks','Neural networks',1020,190,['gradient','overfitting'],summary='Layers of learned transformations compose a flexible prediction function.')]),
        dict(id='graphs',title='Graph algorithms for interviews', category='Computer Science / Algorithms', goal='Choose an algorithm from a problem’s constraints and explain why it fits.',depth='Interview readiness', status='active', excludes='Advanced flow algorithms and competitive programming tricks.',outcomes=['Recognize shortest-path problems','Explain when Dijkstra applies','Compare shortest paths with minimum spanning trees'],concepts=[concept('representation','Representing graphs',70,190),concept('traversal','BFS & DFS',320,100,['representation']),concept('weights','Weighted edges',320,290,['representation']),concept('dijkstra','Dijkstra',600,100,['traversal','weights']),concept('kruskal','Kruskal',860,290,['weights'])]),
        dict(id='thomism',title='Foundations of Thomistic metaphysics',category='Theology / Thomism',goal='Discuss act, potency, essence, and existence with careful distinctions.',depth='Conversational fluency',status='planned',excludes='A complete survey of Aquinas or advanced scholastic disputes.',outcomes=['Distinguish act from potency','Explain essence and existence'],concepts=[concept('change','Change & causation',70,190),concept('act','Act & potency',350,100,['change']),concept('essence','Essence & existence',650,240,['act'])])
    ],ideas=[],sessions=[])
